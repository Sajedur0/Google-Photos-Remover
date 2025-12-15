import { startDeletionProcess, getAccountFromUrl } from './google-photos-deletion.js';

if (window.location.href.includes("photos.google.com") &&
    (window.location.href.includes("?delete_all") || window.location.href.includes("&delete_all"))) {
    
    const accountInfo = getAccountFromUrl();
    
    startDeletionProcess();
}

export {
    startDeletionProcess,
    getAccountFromUrl
};
