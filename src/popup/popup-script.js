const deletePhotosBtn = document.getElementById('deletePhotosBtn');

document.addEventListener('DOMContentLoaded', () => {
    deletePhotosBtn.disabled = false;
    
    deletePhotosBtn.addEventListener('click', handleDeletePhotos);
});

function handleDeletePhotos(e) {
    e.preventDefault();
    
    const deleteUrl = 'https://accounts.google.com/SignOutOptions?hl=en&continue=https://photos.google.com/%3Fdelete_all&service=lh2&ec=GBRAHw';
    chrome.tabs.create({ url: deleteUrl });
}
