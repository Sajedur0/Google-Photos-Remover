/**
 * Google Photos Remover — content script.
 *
 * Injected only on photos.google.com URLs that contain the `delete_all`
 * trigger (see manifest.json `include_globs`). It drives Google Photos'
 * own UI — it never talks to a server and never touches photo data itself.
 *
 * Design notes:
 *  - No frameworks, no dynamic imports, no remote code.
 *  - Selection is done in small batches (Google caps selection sizes and the
 *    UI becomes sluggish with huge selections).
 *  - Waits are event-driven (MutationObserver + a light safety poll) instead
 *    of a tight 50 ms polling loop.
 *  - Every wait is cancellable, so the Stop button responds immediately.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Configuration
   * ------------------------------------------------------------------ */

  const TRIGGER_PARAM = 'delete_all';
  const BATCH_SIZE = 500;
  const MAX_BATCHES = 1000;
  const IDLE_SCROLL_LIMIT = 8;
  const DIALOG_CLOSE_TIMEOUT = 45000;
  const TRASH_URL = 'https://photos.google.com/trash';
  const LOG_PREFIX = '[Google Photos Remover]';

  // Most specific first. Keeping the `jsaction` requirement avoids clicking
  // "select all" style checkboxes that are not photo tiles.
  const CHECKBOX_SELECTORS = [
    'div[role="checkbox"][aria-checked="false"][jsaction^="mousedown"]',
    '[role="checkbox"][aria-checked="false"][jsaction^="mousedown"]',
    'div[role="checkbox"][aria-checked="false"][jsaction*="mousedown"]'
  ];

  // Photo tiles that are currently selected (used to verify a batch really
  // left the library, and that the user did not leave a selection behind).
  const CHECKED_SELECTOR =
    'div[role="checkbox"][aria-checked="true"][jsaction^="mousedown"]';

  const DELETE_BUTTON_SELECTORS = [
    'div[data-delete-origin] button',
    '[data-delete-origin] button',
    '[data-delete-origin][role="button"]',
    'button[aria-label="Delete" i]',
    'button[aria-label*="move to trash" i]',
    'button[jsaction*="delete" i]'
  ];

  const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

  const DIALOG_CONFIRM_SELECTORS = [
    '[data-mdc-dialog-button-default]',
    '[data-mdc-dialog-action="delete"]',
    '[data-mdc-dialog-action="confirm"]',
    '[data-mdc-dialog-action="ok"]'
  ];

  // Used only as a fallback when the stable Material attributes are missing.
  const CONFIRM_TEXT = /move to trash|delete|remove|trash|মুছে ফেলুন|মুছুন|ট্র্যাশে/i;
  const CANCEL_TEXT = /cancel|close|dismiss|not now|no thanks|বাতিল|ফিরে যান|বন্ধ/i;

  const PHASE_LABELS = {
    starting: 'Starting…',
    selecting: 'Selecting photos',
    deleting: 'Moving to Trash',
    waiting: 'Waiting for Google Photos',
    completed: 'Finished',
    stopped: 'Stopped',
    error: 'Needs attention'
  };

  const numberFormat = new Intl.NumberFormat();

  /* ------------------------------------------------------------------ *
   * Entry guard
   * ------------------------------------------------------------------ */

  if (!isTriggered()) return;
  if (window.__gprContentLoaded) return;
  window.__gprContentLoaded = true;

  const controller = new AbortController();
  const state = {
    phase: 'starting',
    message: 'Starting…',
    selected: 0,
    totalDeleted: 0
  };

  let ui = null;
  let renderQueued = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'GPR_STATUS') {
      sendResponse(getStatus());
      return;
    }

    if (message.type === 'GPR_STOP') {
      stop();
      sendResponse(getStatus());
    }
  });

  /* ------------------------------------------------------------------ *
   * Main flow
   * ------------------------------------------------------------------ */

  async function main() {
    showUI();
    const signal = controller.signal;

    try {
      setPhase('starting', 'Connecting to Google Photos…');
      const ready = await waitFor(
        () => getMain() || document.querySelector('[role="checkbox"]'),
        { timeout: 15000, signal }
      );

      if (!ready) {
        throw new UserError(
          'Google Photos did not load in time. Check your connection and reload the page.'
        );
      }

      let emptyRounds = 0;

      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        throwIfAborted(signal);

        state.selected = 0;
        setPhase('selecting', 'Selecting photos…');
        const selected = await selectPhotos(BATCH_SIZE, signal);

        if (selected === 0) {
          emptyRounds += 1;

          // Give the grid at least two rounds before declaring it empty: the
          // shell can exist while photos are still being fetched.
          if (emptyRounds >= 3 || (emptyRounds >= 2 && (await looksEmpty(signal)))) {
            finish();
            return;
          }

          setPhase('waiting', 'Waiting for Google Photos to load…');
          await sleep(1500, signal);
          continue;
        }

        emptyRounds = 0;
        state.selected = selected;
        setPhase('deleting', `Moving ${describeCount(selected)} to Trash…`);
        await moveToTrash(signal);

        state.totalDeleted += selected;
        state.selected = 0;
        scheduleRender();

        setPhase('selecting', 'Preparing the next batch…');
        await sleep(1000, signal);
      }

      throw new UserError('The safety limit was reached. Reload the page to continue.');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        markStopped();
        return;
      }

      console.warn(LOG_PREFIX, error);
      setPhase(
        'error',
        error instanceof UserError
          ? error.message
          : 'Something went wrong. Reload the page and try again.'
      );
    }
  }

  async function selectPhotos(limit, signal) {
    let selected = 0;
    let idleScrolls = 0;
    let firstClick = true;

    scrollToTop();
    await sleep(350, signal);

    while (selected < limit) {
      throwIfAborted(signal);

      const boxes = getUncheckedBoxes();

      if (boxes.length === 0) {
        // Nothing visible to click: scroll forward until the grid stops
        // growing. The empty-library check happens once per batch instead of
        // on every scroll, which keeps large libraries fast.
        if (idleScrolls >= IDLE_SCROLL_LIMIT) break;

        const moved = scrollDown();
        idleScrolls += 1;
        await sleep(moved ? 250 : 500, signal);
        continue;
      }

      idleScrolls = 0;

      for (const box of boxes) {
        throwIfAborted(signal);
        if (selected >= limit) break;
        if (!box.isConnected) continue;
        if (box.getAttribute('aria-checked') !== 'false') continue;

        box.click();
        selected += 1;
        state.selected = selected;
        scheduleRender();

        if (firstClick) {
          // The selection toolbar replaces the page header after the first
          // click; give it a moment so the grid does not re-render under us.
          firstClick = false;
          await sleep(180, signal);
        } else if (selected % 100 === 0) {
          // Give Material's selection model a short breather on long batches.
          await sleep(20, signal);
        } else if (selected % 20 === 0) {
          // Yield to Google's event handlers so a big batch stays smooth.
          await sleep(0, signal);
        }
      }

      await sleep(120, signal);
      scrollDown();
    }

    return selected;
  }

  async function moveToTrash(signal) {
    const deleteButton = await waitForElement(DELETE_BUTTON_SELECTORS, {
      timeout: 10000,
      signal
    });

    if (!deleteButton) {
      throw new UserError(
        'Could not find the Delete button. Google Photos may have changed, or the selection was lost.'
      );
    }

    deleteButton.click();

    // Google sometimes shows a "back up your photos?" notice with an
    // autofocused button. Never press Cancel/Close.
    const noticeButton = await waitForElement('div[role="dialog"] button[autofocus]', {
      timeout: 1200,
      signal
    });

    let interacted = false;

    if (noticeButton && !looksLikeCancelButton(noticeButton)) {
      interacted = true;
      noticeButton.click();
      await sleep(250, signal);
    }

    let sawDialog = false;

    // Material dialogs can appear in two steps (notice -> confirmation).
    for (let step = 0; step < 3; step += 1) {
      throwIfAborted(signal);

      const dialog =
        getVisibleDialog() ||
        (await waitForElement(DIALOG_SELECTOR, {
          timeout: step === 0 ? (interacted ? 2000 : 6000) : 2000,
          signal
        }));

      if (!dialog) break;
      sawDialog = true;

      const button = await waitFor(() => pickDialogButton(dialog), {
        timeout: 3000,
        signal
      });

      if (!button) {
        throw new UserError(
          'The delete dialog had no usable button. Google Photos may have changed.'
        );
      }

      const confirmed = looksLikeConfirmButton(button);
      button.click();

      // Wait for this dialog to close before looking for the next one.
      await waitFor(() => !isVisible(dialog), { timeout: 5000, signal });

      // The confirmation was pressed: the remaining dialog (if any) is just
      // the deletion progress, which the check below waits for.
      if (confirmed || isVisible(dialog)) break;
      await sleep(200, signal);
    }

    const closed = await waitFor(() => !getVisibleDialog(), {
      timeout: DIALOG_CLOSE_TIMEOUT,
      signal
    });

    if (!closed) {
      throw new UserError(
        'Google Photos did not finish moving the photos. Reload the page to check what is in Trash.'
      );
    }

    // Only count a batch once Google has actually cleared the selection, so a
    // missed dialog or a failed request is never reported as a deletion.
    const cleared = await waitFor(
      () => !document.querySelector(CHECKED_SELECTOR),
      { timeout: sawDialog ? 10000 : 6000, signal }
    );

    if (!cleared) {
      throw new UserError(
        sawDialog
          ? 'Google Photos did not confirm the deletion. Reload the page and try again.'
          : 'The delete confirmation did not appear, so nothing was moved to Trash.'
      );
    }
  }

  function looksLikeConfirmButton(button) {
    if (CONFIRM_TEXT.test(button.textContent || '')) return true;

    return button.matches(
      '[data-mdc-dialog-action="delete"], [data-mdc-dialog-action="confirm"]'
    );
  }

  function looksLikeCancelButton(button) {
    if (CANCEL_TEXT.test(button.textContent || '')) return true;

    return button.matches(
      '[data-mdc-dialog-action="cancel"], [data-mdc-dialog-action="close"], [data-mdc-dialog-action="dismiss"]'
    );
  }

  async function looksEmpty(signal) {
    await sleep(650, signal);

    const scope = getMain() || document;

    if (scope.querySelector('[role="checkbox"]')) return false;
    if (scope.querySelector('img[src*="googleusercontent.com"]')) return false;
    if (document.querySelector('[role="progressbar"], [aria-busy="true"]')) return false;

    return true;
  }

  function finish() {
    state.selected = 0;
    removeTriggerParam();

    setPhase(
      'completed',
      state.totalDeleted > 0
        ? `${describeCount(state.totalDeleted)} moved to Trash. Empty Trash to delete them permanently.`
        : 'Nothing left to delete. If photos are still loading, reload the page and try again.'
    );
  }

  function markStopped() {
    state.selected = 0;
    // A reload after Stop must not silently restart the run.
    removeTriggerParam();
    setPhase(
      'stopped',
      state.totalDeleted > 0
        ? `Stopped. ${describeCount(state.totalDeleted)} already in Trash. Reload the page to clear the current selection.`
        : 'Stopped. Nothing was moved to Trash. Reload the page to clear the current selection.'
    );
  }

  function stop() {
    if (!isRunningPhase(state.phase)) return;
    controller.abort();
    markStopped();
  }

  /* ------------------------------------------------------------------ *
   * DOM helpers
   * ------------------------------------------------------------------ */

  function getMain() {
    return (
      document.querySelector('c-wiz[role="main"]') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('main')
    );
  }

  function getUncheckedBoxes() {
    for (const selector of CHECKBOX_SELECTORS) {
      const boxes = document.querySelectorAll(selector);
      if (boxes.length > 0) return boxes;
    }
    return [];
  }

  function getVisibleDialog() {
    const dialogs = document.querySelectorAll(DIALOG_SELECTOR);
    for (const dialog of dialogs) {
      if (isVisible(dialog)) return dialog;
    }
    return null;
  }

  function pickDialogButton(dialog) {
    const buttons = Array.from(dialog.querySelectorAll('button')).filter(isVisible);
    if (buttons.length === 0) return null;

    for (const selector of DIALOG_CONFIRM_SELECTORS) {
      const match = buttons.find((button) => button.matches(selector));
      if (match) return match;
    }

    const byText = buttons.find((button) => CONFIRM_TEXT.test(button.textContent || ''));
    if (byText) return byText;

    // Material action buttons are rendered primary-action-last.
    return buttons[buttons.length - 1];
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    if (element.hidden) return false;
    if (!element.getClientRects().length) return false;

    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /* ------------------------------------------------------------------ *
   * Scrolling
   * ------------------------------------------------------------------ */

  let scrollerCache = { element: null, at: 0 };

  function getScroller() {
    const now = Date.now();
    if (
      scrollerCache.element &&
      scrollerCache.element.isConnected &&
      now - scrollerCache.at < 2000
    ) {
      return scrollerCache.element;
    }

    const element = resolveScroller();
    scrollerCache = { element, at: now };
    return element;
  }

  function resolveScroller() {
    const main = getMain();
    if (main && isScrollable(main)) return main;

    const anchor =
      document.querySelector('div[role="checkbox"]') ||
      (main && main.querySelector('img'));

    let node = anchor ? anchor.parentElement : null;
    while (node && node !== document.documentElement) {
      if (isScrollable(node)) return node;
      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function isScrollable(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.scrollHeight <= element.clientHeight + 40) return false;

    const overflowY = getComputedStyle(element).overflowY;
    return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  }

  function isDocumentScroller(element) {
    return (
      element === document.scrollingElement ||
      element === document.documentElement ||
      element === document.body
    );
  }

  function scrollToTop() {
    const scroller = getScroller();
    if (!scroller) return;

    if (isDocumentScroller(scroller)) {
      window.scrollTo(0, 0);
    } else {
      scroller.scrollTop = 0;
    }
  }

  function scrollDown() {
    const scroller = getScroller();
    if (!scroller) return false;

    if (isDocumentScroller(scroller)) {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(400, Math.round(window.innerHeight * 0.9)));
      return window.scrollY > before + 1;
    }

    const before = scroller.scrollTop;
    const step = Math.max(400, Math.round((scroller.clientHeight || 800) * 0.9));
    scroller.scrollTop = before + step;
    return scroller.scrollTop > before + 1;
  }

  /* ------------------------------------------------------------------ *
   * Async utilities
   * ------------------------------------------------------------------ */

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(createAbortError());
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      function onAbort() {
        cleanup();
        reject(createAbortError());
      }

      function cleanup() {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Resolves with the first truthy value returned by `check`, or `null` after
   * `timeout`. MutationObserver + a 400 ms fallback poll keeps this cheap and
   * still works when DOM changes are not observable (style-driven layout).
   */
  function waitFor(check, { timeout = 10000, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(createAbortError());
        return;
      }

      let settled = false;
      let queued = 0;
      let observer = null;
      let timeoutId = 0;
      let intervalId = 0;
      let initial;

      function cleanup() {
        clearTimeout(queued);
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        if (observer) observer.disconnect();
        if (signal) signal.removeEventListener('abort', onAbort);
      }

      function settle(value, error) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }

      function evaluate() {
        queued = 0;
        if (settled) return;

        let result;
        try {
          result = check();
        } catch (error) {
          settle(null, error);
          return;
        }

        if (result) settle(result);
      }

      // setTimeout instead of requestAnimationFrame: content scripts can run
      // in hidden tabs, where animation frames are paused.
      function schedule() {
        if (settled || queued) return;
        queued = setTimeout(evaluate, 0);
      }

      function onAbort() {
        settle(null, createAbortError());
      }

      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      try {
        initial = check();
      } catch (error) {
        settle(null, error);
        return;
      }

      if (initial) {
        settle(initial);
        return;
      }

      if (!document.documentElement) {
        settle(null);
        return;
      }

      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-checked', 'aria-disabled', 'aria-hidden', 'disabled', 'hidden']
      });

      intervalId = setInterval(schedule, 400);
      timeoutId = setTimeout(() => settle(null), timeout);
    });
  }

  function waitForElement(selectors, options = {}) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    const { visible = true, ...waitOptions } = options;

    return waitFor(() => {
      for (const selector of list) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
          if (!visible || isVisible(node)) return node;
        }
      }
      return null;
    }, waitOptions);
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
  }

  function createAbortError() {
    try {
      return new DOMException('Stopped by user', 'AbortError');
    } catch (_error) {
      const error = new Error('Stopped by user');
      error.name = 'AbortError';
      return error;
    }
  }

  function isTriggered() {
    try {
      return new URL(window.location.href).searchParams.has(TRIGGER_PARAM);
    } catch (_error) {
      return false;
    }
  }

  function isRunningPhase(phase) {
    return (
      phase === 'starting' ||
      phase === 'selecting' ||
      phase === 'deleting' ||
      phase === 'waiting'
    );
  }

  function describeCount(count) {
    return `${numberFormat.format(count)} ${count === 1 ? 'item' : 'items'}`;
  }

  function getStatus() {
    return {
      ok: true,
      phase: state.phase,
      message: state.message,
      selected: state.selected,
      totalDeleted: state.totalDeleted,
      running: isRunningPhase(state.phase)
    };
  }

  function removeTriggerParam() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(TRIGGER_PARAM)) return;
      url.searchParams.delete(TRIGGER_PARAM);
      window.history.replaceState(window.history.state, '', url.href);
    } catch (_error) {
      // Non-fatal: the run has already finished.
    }
  }

  /* ------------------------------------------------------------------ *
   * Panel UI (shadow DOM keeps Google Photos styles out)
   * ------------------------------------------------------------------ */

  function setPhase(phase, message) {
    state.phase = phase;
    if (typeof message === 'string') state.message = message;
    scheduleRender();
  }

  function scheduleRender() {
    if (renderQueued || !ui || ui.destroyed) return;
    renderQueued = true;

    // A plain timeout works in background tabs too, unlike rAF.
    setTimeout(() => {
      renderQueued = false;
      render();
    }, 50);
  }

  function render() {
    if (!ui || ui.destroyed) return;

    ui.card.dataset.phase = state.phase;
    setText(ui.label, PHASE_LABELS[state.phase] || 'Working');
    setText(ui.status, state.message);
    setText(ui.selectedEl, numberFormat.format(state.selected));
    setText(ui.deletedEl, numberFormat.format(state.totalDeleted));

    const running = isRunningPhase(state.phase);
    ui.stopBtn.hidden = !running;
    ui.closeBtn.hidden = running;
    ui.reloadBtn.hidden = state.phase !== 'error';
    ui.trashLink.hidden = !(state.phase === 'completed' && state.totalDeleted > 0);
  }

  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function showUI() {
    if (ui) return;

    const host = document.createElement('div');
    host.setAttribute('data-gpr-root', '');

    const shadow = host.attachShadow({ mode: 'open' });
    applyShadowStyles(shadow);

    const card = element('div', 'card');
    card.dataset.phase = state.phase;

    const header = element('div', 'head');
    const logo = element('div', 'logo');
    logo.setAttribute('aria-hidden', 'true');

    const titles = element('div', 'titles');
    const title = element('div', 'title', 'Google Photos Remover');
    const label = element('div', 'sub', PHASE_LABELS[state.phase] || 'Working');
    titles.append(title, label);
    header.append(logo, titles);

    const status = element('p', 'status', state.message);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const stats = element('div', 'stats');
    const selected = buildStat('Selected');
    const deleted = buildStat('In Trash');
    stats.append(selected.root, deleted.root);

    const progress = element('div', 'progress');
    progress.append(document.createElement('i'));

    const actions = element('div', 'actions');
    const stopBtn = buildButton('Stop', 'btn danger', stop);
    const closeBtn = buildButton('Close', 'btn ghost', closeUI);
    const reloadBtn = buildButton('Reload page', 'btn ghost', () => window.location.reload());

    const trashLink = document.createElement('a');
    trashLink.className = 'btn primary';
    trashLink.href = TRASH_URL;
    trashLink.target = '_blank';
    trashLink.rel = 'noopener noreferrer';
    trashLink.textContent = 'Open Trash';

    actions.append(stopBtn, closeBtn, reloadBtn, trashLink);
    card.append(header, status, stats, progress, actions);
    shadow.append(card);
    document.documentElement.append(host);

    ui = {
      host,
      card,
      label,
      status,
      selectedEl: selected.value,
      deletedEl: deleted.value,
      stopBtn,
      closeBtn,
      reloadBtn,
      trashLink,
      destroyed: false
    };

    render();
  }

  function buildStat(labelText) {
    const root = element('div', 'stat');
    const value = element('b', '', '0');
    const label = element('span', '', labelText);
    root.append(value, label);
    return { root, value };
  }

  function buildButton(labelText, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = labelText;
    button.addEventListener('click', onClick);
    return button;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function closeUI() {
    if (!ui) return;
    ui.destroyed = true;
    ui.host.remove();
  }

  function applyShadowStyles(shadow) {
    try {
      if ('adoptedStyleSheets' in shadow && typeof CSSStyleSheet === 'function') {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(UI_CSS);
        shadow.adoptedStyleSheets = [sheet];
        return;
      }
    } catch (_error) {
      // Fall through to a <style> element.
    }

    const style = document.createElement('style');
    style.textContent = UI_CSS;
    shadow.append(style);
  }

  class UserError extends Error {
    constructor(message) {
      super(message);
      this.name = 'UserError';
    }
  }

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */

  const UI_CSS = `
    :host { all: initial; }

    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .card {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      width: 320px;
      max-width: calc(100vw - 32px);
      overflow: hidden;
      background: #ffffff;
      color: #202124;
      border: 1px solid rgba(60, 64, 67, 0.16);
      border-radius: 16px;
      box-shadow: 0 12px 32px rgba(32, 33, 36, 0.22), 0 2px 6px rgba(32, 33, 36, 0.12);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      text-align: left;
      animation: gpr-in 160ms ease-out;
    }

    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 14px 10px;
    }

    .logo {
      flex: none;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: conic-gradient(from 45deg, #4285f4 0 25%, #34a853 25% 50%, #fbbc04 50% 75%, #ea4335 75% 100%);
    }

    .titles { min-width: 0; }

    .title {
      font-size: 13.5px;
      font-weight: 650;
      letter-spacing: -0.1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sub {
      font-size: 11px;
      color: #5f6368;
    }

    .status {
      margin: 0;
      padding: 12px 14px 10px;
      min-height: 20px;
      color: #3c4043;
      font-size: 13px;
    }

    .stats {
      display: flex;
      gap: 8px;
      padding: 0 14px 12px;
    }

    .stat {
      flex: 1;
      padding: 8px 10px;
      background: #f8f9fa;
      border: 1px solid #eef0f2;
      border-radius: 10px;
    }

    .stat b {
      display: block;
      font-size: 18px;
      font-weight: 650;
      letter-spacing: -0.2px;
      font-variant-numeric: tabular-nums;
    }

    .stat span {
      display: block;
      margin-top: 1px;
      font-size: 10px;
      color: #5f6368;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .progress {
      height: 3px;
      background: #e8f0fe;
      overflow: hidden;
    }

    .progress i {
      display: block;
      width: 38%;
      height: 100%;
      background: #1a73e8;
      animation: gpr-slide 1.3s ease-in-out infinite;
    }

    .card[data-phase="completed"] .progress { background: #34a853; }
    .card[data-phase="completed"] .progress i { width: 100%; background: #34a853; animation: none; }
    .card[data-phase="stopped"] .progress i { width: 100%; background: #dadce0; animation: none; }
    .card[data-phase="error"] .progress i { width: 100%; background: #f28b82; animation: none; }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 14px 14px;
    }

    .btn {
      flex: 1 1 auto;
      min-width: 96px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 9px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background-color 120ms ease, box-shadow 120ms ease;
    }

    .btn:focus-visible {
      outline: 2px solid #1a73e8;
      outline-offset: 2px;
    }

    .btn.primary { background: #1a73e8; color: #ffffff; }
    .btn.primary:hover { background: #1765cc; }

    .btn.ghost { background: #f1f3f4; color: #3c4043; }
    .btn.ghost:hover { background: #e8eaed; }

    .btn.danger { background: #fce8e6; color: #c5221f; }
    .btn.danger:hover { background: #fad2cf; }

    .card[data-phase="completed"] .sub { color: #188038; }
    .card[data-phase="stopped"] .sub { color: #80868b; }
    .card[data-phase="error"] .sub { color: #d93025; }

    @keyframes gpr-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes gpr-slide {
      0% { transform: translateX(-110%); }
      100% { transform: translateX(290%); }
    }

    @media (prefers-reduced-motion: reduce) {
      .card { animation: none; }
      .progress i { animation: none; }
    }

    @media (max-width: 420px) {
      .card { right: 12px; bottom: 12px; width: calc(100vw - 24px); }
    }
  `;
  main();
})();
