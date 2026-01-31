import { addLog } from '../lib/storage.js';
const domainDisplay = document.getElementById('domain');
const urlDisplay = document.getElementById('url');
const blockButton = document.getElementById('block');
const proceedButton = document.getElementById('proceed');
function getUrlFromParams() {
    const params = new URLSearchParams(window.location.search);
    return params.get('url');
}
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
}
const originalUrl = getUrlFromParams();
if (!originalUrl) {
    document.body.innerHTML = '<p class="error">No URL specified</p>';
}
else {
    const domain = extractDomain(originalUrl);
    domainDisplay.textContent = domain;
    urlDisplay.textContent = originalUrl;
    let actionTaken = false;
    // Log as blocked if user closes tab without clicking Block or Proceed
    window.addEventListener('beforeunload', () => {
        if (!actionTaken) {
            const message = {
                type: 'LOG_BLOCK',
                domain,
                fullUrl: originalUrl,
            };
            chrome.runtime.sendMessage(message);
        }
    });
    blockButton.addEventListener('click', async () => {
        actionTaken = true;
        await addLog({
            timestamp: Date.now(),
            domain,
            fullUrl: originalUrl,
            action: 'blocked',
        });
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.remove(tab.id);
        }
    });
    proceedButton.addEventListener('click', async () => {
        actionTaken = true;
        const logId = await addLog({
            timestamp: Date.now(),
            domain,
            fullUrl: originalUrl,
            action: 'proceeded',
        });
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tab?.id ?? 0;
        const message = {
            type: 'ALLOW_ONCE',
            domain,
            url: originalUrl,
            logId,
            tabId,
        };
        // Navigation handled by background script after rule update
        await chrome.runtime.sendMessage(message);
    });
}
