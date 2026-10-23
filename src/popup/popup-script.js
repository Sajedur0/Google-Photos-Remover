// SPDX-License-Identifier: Apache-2.0
/**
 * Popup controller.
 *
 * Zero permissions are used here: `tabs.create` and `tabs.sendMessage` work
 * because the extension already declares the photos.google.com content
 * script, and the popup only talks to its own script.
 */
(() => {
  'use strict';

  // AccountChooser asks which Google account to use, then continues to
  // Google Photos with the `delete_all` trigger. Using the chooser instead of
  // the sign-out page means the user's active session is not terminated.
  const START_URL =
    'https://accounts.google.com/AccountChooser?service=lh2&continue=' +
    encodeURIComponent('https://photos.google.com/?delete_all');

  const LAST_RUN_KEY = 'gpr:lastRun';
  const POLL_INTERVAL = 900;
  const FIRST_POLL_DELAY = 700;
  const ANSWER_TIMEOUT = 600;
  const LOADING_GIVE_UP = 30000;

  const PHASE_LABELS = {
    starting: 'Starting',
    selecting: 'Selecting photos',
    deleting: 'Moving to Trash',
    waiting: 'Waiting for Google Photos',
    completed: 'Finished',
    stopped: 'Stopped',
    error: 'Needs attention'
  };

  const numberFormat = new Intl.NumberFormat();

  const ui = {
    version: byId('version'),
    statusCard: byId('statusCard'),
    statusTitle: byId('statusTitle'),
    statusText: byId('statusText'),
    stats: byId('stats'),
    selected: byId('selectedCount'),
    deleted: byId('deletedCount'),
    startBtn: byId('startBtn'),
    stopBtn: byId('stopBtn'),
    lastRun: byId('lastRun')
  };

  let tabId = null;
  let pollTimer = 0;
  let pollStartedAt = 0;

  init();

  function init() {
    ui.version.textContent = `v${chrome.runtime.getManifest().version}`;
    showLastRun();

    ui.startBtn.addEventListener('click', startRun);
    ui.stopBtn.addEventListener('click', stopRun);

    detectExistingRun();
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */

  async function startRun() {
    ui.startBtn.disabled = true;
    resetStats();
    setStatus('starting', 'Opening Google Photos in a new tab…');

    try {
      const tab = await chrome.tabs.create({ url: START_URL });
      tabId = tab.id;
      rememberRun();
      setRunning(true);
      startPolling();
    } catch (error) {
      console.warn('[Google Photos Remover] Could not open the tab:', error);
      ui.startBtn.disabled = false;
      setStatus('error', 'Could not open a new tab. Reload the extension and try again.');
    }
  }

  async function stopRun() {
    if (!tabId) return;

    ui.stopBtn.disabled = true;
    const response = await askTab(tabId, { type: 'GPR_STOP' });
    ui.stopBtn.disabled = false;

    if (response) {
      stopPolling();
      applyStatus(response);
      return;
    }

    setStatus('error', 'Could not reach the page. Close the Google Photos tab to stop.');
  }

  /* ------------------------------------------------------------------ *
   * Status sync
   * ------------------------------------------------------------------ */

  async function detectExistingRun() {
    let tabs;

    try {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (_error) {
      return;
    }

    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') return;

    const status = await askTab(tab.id, { type: 'GPR_STATUS' });

    // Do not hijack a run that was started while this lookup was in flight.
    if (!status || tabId !== null) return;

    tabId = tab.id;
    applyStatus(status);
    if (status.running) startPolling();
  }

  function startPolling() {
    stopPolling();
    pollStartedAt = Date.now();
    pollTimer = setTimeout(tick, FIRST_POLL_DELAY);

    async function tick() {
      if (!tabId) return;

      const status = await askTab(tabId, { type: 'GPR_STATUS' });

      if (status) {
        applyStatus(status);
        if (!status.running) {
          stopPolling();
          return;
        }
      } else if (Date.now() - pollStartedAt > LOADING_GIVE_UP) {
        stopPolling();
        setRunning(false);
        ui.startBtn.disabled = false;
        setStatus('waiting', 'The page is taking a while. Check the Google Photos tab, or try again.');
        return;
      } else if (Date.now() - pollStartedAt > 4000) {
        setStatus('waiting', 'Waiting for Google Photos to load…');
      }

      pollTimer = setTimeout(tick, POLL_INTERVAL);
    }
  }

  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = 0;
  }

  /**
   * Sends a message to the content script in `id`. Resolves to `null` when the
   * tab is not a Google Photos page, has no content script, or is unresponsive.
   */
  function askTab(id, message) {
    return new Promise((resolve) => {
      let done = false;

      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }

      const timer = setTimeout(() => finish(null), ANSWER_TIMEOUT);

      try {
        chrome.tabs.sendMessage(id, message, (response) => {
          // Reading lastError prevents "Unchecked runtime.lastError" noise.
          if (chrome.runtime.lastError) {
            finish(null);
            return;
          }

          finish(response || null);
        });
      } catch (_error) {
        finish(null);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function applyStatus(status) {
    const phase = typeof status.phase === 'string' ? status.phase : 'error';
    const running = Boolean(status.running);

    ui.statusCard.dataset.phase = phase;
    setText(ui.statusTitle, PHASE_LABELS[phase] || 'Working');
    setText(ui.statusText, status.message || 'Working on your photos…');

    ui.stats.hidden = false;
    setText(ui.selected, numberFormat.format(toCount(status.selected)));
    setText(ui.deleted, numberFormat.format(toCount(status.totalDeleted)));

    ui.startBtn.textContent = phase === 'completed' ? 'Run again' : 'Remove all photos';

    if (running) {
      setRunning(true);
      return;
    }

    setRunning(false);
    ui.startBtn.disabled = false;
  }

  function setStatus(phase, message) {
    ui.statusCard.dataset.phase = phase;
    setText(ui.statusTitle, PHASE_LABELS[phase] || 'Ready when you are');
    setText(ui.statusText, message);
  }

  function resetStats() {
    ui.stats.hidden = true;
    setText(ui.selected, '0');
    setText(ui.deleted, '0');
  }

  function setRunning(running) {
    ui.startBtn.hidden = running;
    ui.stopBtn.hidden = !running;
    ui.stopBtn.disabled = false;
  }

  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  /* ------------------------------------------------------------------ *
   * Last run marker (popup-local storage, no "storage" permission needed)
   * ------------------------------------------------------------------ */

  function rememberRun() {
    try {
      localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
    } catch (_error) {
      // Private mode or storage disabled: purely cosmetic.
    }

    showLastRun();
  }

  function showLastRun() {
    let startedAt = 0;

    try {
      startedAt = Number(localStorage.getItem(LAST_RUN_KEY)) || 0;
    } catch (_error) {
      return;
    }

    if (!startedAt) return;

    ui.lastRun.hidden = false;
    setText(ui.lastRun, `Last start ${relativeTime(startedAt)}`);
  }

  function relativeTime(timestamp) {
    const seconds = Math.round((timestamp - Date.now()) / 1000);
    if (seconds > -60) return 'just now';

    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const minutes = Math.round(seconds / 60);
    if (minutes > -60) return formatter.format(minutes, 'minute');

    const hours = Math.round(minutes / 60);
    if (hours > -24) return formatter.format(hours, 'hour');

    return formatter.format(Math.round(hours / 24), 'day');
  }
})();
