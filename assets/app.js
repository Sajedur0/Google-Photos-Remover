var B=Object.defineProperty;var I=(t,e,n)=>e in t?B(t,e,{enumerable:!0,configurable:!0,writable:!0,value:n}):t[e]=n;var p=(t,e,n)=>(I(t,typeof e!="symbol"?e+"":e,n),n);function g(){}function O(t){return t()}function E(){return Object.create(null)}function h(t){t.forEach(O)}function j(t){return typeof t=="function"}function W(t,e){return t!=t?e==e:t!==e||t&&typeof t=="object"||typeof t=="function"}function M(t){return Object.keys(t).length===0}function X(t,e){t.appendChild(e)}function Y(t,e,n){t.insertBefore(e,n||null)}function P(t){t.parentNode&&t.parentNode.removeChild(t)}function Z(t){return document.createElement(t)}function A(t){return document.createTextNode(t)}function tt(){return A(" ")}function et(){return A("")}function ut(t,e,n,r){return t.addEventListener(e,n,r),()=>t.removeEventListener(e,n,r)}function rt(t){return function(e){return e.preventDefault(),t.call(this,e)}}function ot(t,e,n){n==null?t.removeAttribute(e):t.getAttribute(e)!==n&&t.setAttribute(e,n)}function z(t){return Array.from(t.childNodes)}function ut(t,e){e=""+e,t.data!==e&&(t.data=e)}let l;function a(t){l=t}function D(){if(!l)throw new Error("Function called outside component initialization");return l}function it(t){D().$$.on_mount.push(t)}const c=[],S=[];let f=[];const N=[],F=Promise.resolve();let m=!1;function R(){if(!m)throw new Error("Function called outside component initialization");return l}function y(t){f.push(t)}const $=new Set;let s=0;function C(){if(s!==0)return;const t=l;do{try{for(;s<c.length;){const e=c[s];s++,a(e),T(e.$$)}}catch(e){throw c.length=0,s=0,e}for(a(null),c.length=0,s=0;S.length;)S.pop()();for(let e=0;e<f.length;e+=1){const n=f[e];$.has(n)||($.add(n),n())}f.length=0}while(c.length);for(;N.length;)N.pop()();m=!1,$.clear(),a(t)}function T(t){if(t.fragment!==null){t.update(),h(t.before_update);const e=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,e),t.after_update.forEach(y)}}function U(t,e){const{fragment:r,after_update:i}=t.$$;r&&r.m(e,n),y(()=>{const d=t.$$.on_mount.map(O).filter(j);t.$$.on_destroy?t.$$.on_destroy.push(...d):h(d),t.$$.on_mount=[]}),i.forEach(y)}const V=new Set;function q(t,e){t&&t.i&&(V.delete(t),t.i(e))}function J(t,e){t.$$.dirty[0]===-1&&(c.push(t),R(),t.$$.dirty.fill(0)),t.$$.dirty[e/31|0]|=1<<e%31}function st(t,e,n,r,i,d,b,L=[-1]){const _=l;a(t);const o=t.$$={fragment:null,ctx:[],props:d,update:g,not_equal:i,bound:E(),on_mount:[],on_destroy:[],on_disconnect:[],before_update:[],after_update:[],context:new Map(e.context||(_?_.$$.context:[])),callbacks:E(),dirty:L,skip_bound:!1,root:e.target||_.$$.root};b&&b(o.root);let w=!1;if(o.ctx=n?n(t,e.props||{},(u,x,...k)=>{const v=k.length?k[0]:x;return o.ctx&&i(o.ctx[u],o.ctx[u]=v)&&(!o.skip_bound&&o.bound[u]&&o.bound[u](v),w&&J(t,u)),x}):[],o.update(),w=!0,h(o.before_update),o.fragment=r?r(o.ctx):!1,e.target){if(e.hydrate){const u=z(e.target);o.fragment&&o.fragment.l(u),u.forEach(P)}else o.fragment&&o.fragment.c();e.intro&&q(t.$$.fragment),G(t,e.target,e.anchor),C()}a(_)}class ct{constructor(){p(this,"$$");p(this,"$$set")}$destroy(){H(this,1),this.$destroy=g}$on(e,n){if(!j(n))return g;const r=this.$$.callbacks[e]||(this.$$.callbacks[e]=[]);return r.push(n),()=>{const i=r.indexOf(n);i!==-1&&r.splice(i,1)}}$set(e){this.$$set&&!M(e)&&(this.$$.skip_bound=!0,this.$$set(e),this.$$.skip_bound=!1)}}const K="4";typeof window<"u"&&(window.__svelte||(window.__svelte={v:new Set})).v.add(K);

const MAX_PHOTOS_PER_BATCH = 100000;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElement(selector, timeoutSeconds = 30) {
    const startTime = new Date();
    while (true) {
        const element = document.querySelector(selector);
        if (element) return element;
        
        if (new Date() - startTime >= timeoutSeconds * 1000) return null;
        await delay(50);
    }
}

async function selectPhotosForDeletion() {
    let photosSelected = 0;
    const retryLimit = 10;
    let retryCount = retryLimit;

    document.querySelector('c-wiz[role="main"]')?.scrollBy(0, 500);
    await delay(500);

    while (photosSelected < MAX_PHOTOS_PER_BATCH) {
        const checkboxes = document.querySelectorAll('div[role="checkbox"][aria-checked="false"][jsaction^="mousedown"]');

        if (checkboxes.length > 0) {
            for (let i = 0; i < checkboxes.length; i++) {
                if (photosSelected >= MAX_PHOTOS_PER_BATCH) return photosSelected;
                photosSelected++;
                checkboxes[i].click();
            }
            checkboxes[checkboxes.length - 1].scrollIntoView();
            retryCount = retryLimit;
        } else if (retryCount > 0) {
            document.querySelector('c-wiz[role="main"]')?.scrollBy(0, 1000);
            retryCount--;
            await delay(500);
        } else {
            return photosSelected;
        }
        await delay(300);
    }
    return photosSelected;
}

async function checkForNoPhotosState() {
    const emptyStateSelectors = [
        'div[jsname="d9BH4c"]',
        'div[aria-label*="No photos"]',
        'div[aria-label*="No items"]',
        'div[jsname="WVXJMe"]',
        'div[jsname="d9BH4c"] div[role="img"]',
        'div[aria-label*="Welcome to Google Photos"]',
        'div[jsname="d9BH4c"] div[aria-label]',
        'div:contains("No photos")',
        'div:contains("No items")',
        'div:contains("Welcome to Google Photos")'
    ];

    for (const selector of emptyStateSelectors) {
        try {
            const element = document.querySelector(selector);
            if (element) {
                return true;
            }
        } catch (e) {
        }
    }

    const photoElements = document.querySelectorAll('img[src*="lh3.googleusercontent.com"], img[src*="lh4.googleusercontent.com"], img[src*="lh5.googleusercontent.com"], img[src*="lh6.googleusercontent.com"]');
    if (photoElements.length === 0) {
        return true;
    }

    const gridContainer = document.querySelector('c-wiz[role="main"] div[jsname="d9BH4c"]');
    if (gridContainer) {
        const hasPhotoChildren = gridContainer.querySelector('img, div[role="checkbox"], div[jsaction*="click"]');
        if (!hasPhotoChildren) {
            return true;
        }
    }

    return false;
}

async function deleteSelectedPhotos() {
    let totalDeleted = Number(localStorage.getItem("num_deleted")) || 0;
    let noPhotosCount = 0;
    const maxNoPhotosRetries = 3;

    while (true) {
        const photosSelected = await selectPhotosForDeletion();

        if (photosSelected === 0) {
            noPhotosCount++;
            
            const isEmptyState = await checkForNoPhotosState();
            
            if (isEmptyState || noPhotosCount >= maxNoPhotosRetries) {
                await showCompletionMessage(totalDeleted);
                return;
            }
            
            document.querySelector('c-wiz[role="main"]')?.scrollBy(0, 2000);
            await delay(1000);
            continue;
        }

        noPhotosCount = 0;

        const deleteButton = await waitForElement("div[data-delete-origin] button", 1);
        deleteButton?.click();

        const gotItButton = await waitForElement('div[role="dialog"] button[autofocus]', 0.5);
        gotItButton?.click();

        const moveToTrashButton = await waitForElement("button[data-mdc-dialog-button-default]", 30);
        moveToTrashButton?.click();

        const closeButton = await waitForElement("aside button[aria-label][data-use-native-focus-logic]", 5 * 60);
        if (closeButton) {
            closeButton.click();
            totalDeleted += photosSelected;
            localStorage.setItem("num_deleted", totalDeleted);
            localStorage.setItem("last_deleted_at", new Date().getTime());
        }
    }
}

async function showCompletionMessage(totalDeleted) {
    
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.color = 'white';
    overlay.style.fontFamily = 'Arial, sans-serif';
    
    const messageBox = document.createElement('div');
    messageBox.style.backgroundColor = '#2d5a27';
    messageBox.style.padding = '30px';
    messageBox.style.borderRadius = '12px';
    messageBox.style.textAlign = 'center';
    messageBox.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    messageBox.style.maxWidth = '500px';
    
    const icon = document.createElement('div');
    icon.style.fontSize = '48px';
    icon.style.marginBottom = '15px';
    icon.textContent = '✅';
    
    const title = document.createElement('h2');
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '24px';
    title.textContent = 'All Photos Deleted Successfully!';
    
    const subtitle = document.createElement('p');
    subtitle.style.margin = '0 0 20px 0';
    subtitle.style.fontSize = '16px';
    subtitle.style.opacity = '0.9';
    subtitle.textContent = `Total photos deleted: ${totalDeleted}`;
    
    const instructions = document.createElement('div');
    instructions.style.textAlign = 'left';
    instructions.style.marginBottom = '20px';
    instructions.style.fontSize = '14px';
    instructions.style.opacity = '0.9';
    instructions.innerHTML = `
        <p><strong>Next Steps:</strong></p>
        <ul style="margin: 10px 0 0 20px; padding: 0;">
            <li>Empty your Google Photos trash to permanently delete photos</li>
            <li>This extension will now stop all operations automatically</li>
            <li>You can close this tab safely</li>
        </ul>
    `;
    
    const closeButton = document.createElement('button');
    closeButton.style.padding = '12px 24px';
    closeButton.style.backgroundColor = '#1e4b1b';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '8px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '16px';
    closeButton.style.fontWeight = 'bold';
    closeButton.textContent = 'Close and Continue';
    
    closeButton.addEventListener('click', () => {
        document.body.removeChild(overlay);
        window.location.href = window.location.origin + '/photos/';
    });
    
    messageBox.appendChild(icon);
    messageBox.appendChild(title);
    messageBox.appendChild(subtitle);
    messageBox.appendChild(instructions);
    messageBox.appendChild(closeButton);
    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
    
    setTimeout(() => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    }, 10000);
}

async function startDeletionProcess() {
    try {
        await deleteSelectedPhotos();
    } catch (error) {
    }
}

function getAccountFromUrl() {
    const url = new URL(window.location.href);
    const path = url.pathname;
    
    const accountMatch = path.match(/\/u\/(\d+)\//);
    if (accountMatch) {
        const accountIndex = parseInt(accountMatch[1], 10);
        return { accountIndex: accountIndex };
    }
    
    return null;
}

if (window.location.href.includes("photos.google.com") &&
    (window.location.href.includes("?delete_all") || window.location.href.includes("&delete_all"))) {
    const accountInfo = getAccountFromUrl();
    startDeletionProcess();
}

const injectTime = performance.now();
(async () => {
    const { onExecute } = await import(
        chrome.runtime.getURL("assets/index.ts-8f4093df.js")
    );
    onExecute?.({ perf: { injectTime, loadTime: performance.now() - injectTime } });
})().catch(() => {});
