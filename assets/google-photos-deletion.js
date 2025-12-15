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

export {
    delay,
    waitForElement,
    selectPhotosForDeletion,
    checkForNoPhotosState,
    deleteSelectedPhotos,
    showCompletionMessage,
    startDeletionProcess,
    getAccountFromUrl
};
