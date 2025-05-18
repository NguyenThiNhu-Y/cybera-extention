// Background script for handling events
chrome.runtime.onInstalled.addListener(() => {
    console.log('Cybera Clone extension installed');
});

// We're using the _execute_action command to trigger the popup via Ctrl+M
// The shortcut is defined in the manifest.json 

// Lắng nghe phím tắt Ctrl+M và gửi message tới content script để bật/tắt overlay
chrome.commands.onCommand.addListener((command) => {
    if (command === '_execute_action') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { toggleOverlay: true });
            }
        });
    }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle takeScreenshot action
    if (request.action === "takeScreenshot") {
        console.log("Background script received screenshot request for tab:", sender.tab.id);
        
        try {
            // Capture the visible tab
            chrome.tabs.captureVisibleTab(
                sender.tab.windowId,
                { format: "png" },
                dataUrl => {
                    if (chrome.runtime.lastError) {
                        console.log("Error capturing screenshot:", chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log("Screenshot captured successfully");
                        sendResponse({ success: true, dataUrl: dataUrl });
                    }
                }
            );
            
            // Return true to indicate we'll send a response asynchronously
            return true;
        } catch (e) {
            console.log("Exception capturing screenshot:", e);
            sendResponse({ success: false, error: e.message });
        }
    }
    
    // Add other message handlers as needed
}); 