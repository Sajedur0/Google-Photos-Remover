chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background worker received message:', message);
  
  switch (message.type) {
    case 'DELETE_PHOTOS':
      handlePhotoDeletion(message.data, sendResponse);
      return true;
      
    case 'GET_STATUS':
      sendResponse({ status: 'ready', version: chrome.runtime.getManifest().version });
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

function handlePhotoDeletion(data, sendResponse) {
  try {
    chrome.storage.local.set({ 
      deletionData: data,
      deletionTime: Date.now()
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError });
      } else {
        sendResponse({ success: true, message: 'Deletion data stored' });
      }
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Google Photos Remover installed/updated:', details);
  
  chrome.storage.local.set({
    settings: {
      autoConfirm: false,
      batchSize: 50,
      delayBetweenBatches: 1000
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Google Photos Remover started');
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension action clicked');
});
