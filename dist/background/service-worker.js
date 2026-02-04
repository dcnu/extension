import { initializeStorage, getGreylist, getDomainAliases, addActiveSession, removeActiveSession, getActiveSessionByTab, getActiveSessions, setSessionActive, updateLogDuration, getSessionCountForDomain, } from '../lib/storage.js';
import { updateGreylistRules, authorizeTabForDomain, revokeTabAuthorization, revokeAllAuthorizationsForTab, addInitiatorRule, removeInitiatorRule, } from '../lib/rules.js';
import { cleanUrl } from '../lib/url-cleaner.js';
import { getRootDomain, expandDomainsWithAliases } from '../lib/domain.js';
// Store pending navigation URLs before redirect (keyed by tabId)
const pendingNavigations = new Map();
chrome.runtime.onInstalled.addListener(async () => {
    await initializeStorage();
    const config = await getGreylist();
    await updateGreylistRules(config.domains);
});
chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('src/pages/settings.html'),
    });
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_ORIGINAL_URL') {
        const url = pendingNavigations.get(message.tabId);
        pendingNavigations.delete(message.tabId);
        sendResponse({ url });
        return true;
    }
    if (message.type === 'ALLOW_ONCE') {
        (async () => {
            try {
                pendingNavigations.delete(message.tabId);
                // Always add initiator rule (idempotent - handles duplicates)
                await addInitiatorRule(message.domain);
                await authorizeTabForDomain(message.tabId, message.domain);
                await addActiveSession({
                    logId: message.logId,
                    tabId: message.tabId,
                    domain: message.domain,
                    startTime: Date.now(),
                    accumulatedTime: 0,
                    lastActiveTime: Date.now(), // Start as active (user just clicked proceed)
                });
                // Navigate from background - ensures rule is applied before navigation
                await chrome.tabs.update(message.tabId, { url: message.url });
                sendResponse({ success: true });
            }
            catch (error) {
                console.error('ALLOW_ONCE failed:', error);
                sendResponse({ success: false, error: String(error) });
            }
        })();
        return true;
    }
});
async function copyToClipboard(text) {
    const offscreenUrl = chrome.runtime.getURL('src/offscreen/clipboard.html');
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl],
    });
    if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: offscreenUrl,
            reasons: [chrome.offscreen.Reason.CLIPBOARD],
            justification: 'Copy cleaned URL to clipboard',
        });
        // Wait for document to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    try {
        await chrome.runtime.sendMessage({ type: 'COPY_TEXT', text });
    }
    finally {
        await chrome.offscreen.closeDocument();
    }
}
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'copy-clean-url') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            const cleaned = cleanUrl(tab.url);
            await copyToClipboard(cleaned);
        }
    }
});
// Track time spent on proceeded sites
async function endSession(tabId) {
    const session = await removeActiveSession(tabId);
    if (session) {
        let duration = session.accumulatedTime;
        // Add any time since last activation
        if (session.lastActiveTime) {
            duration += Date.now() - session.lastActiveTime;
        }
        await updateLogDuration(session.logId, duration);
        await revokeTabAuthorization(tabId, session.domain);
        // Remove initiator rule if this was last session for domain
        const remainingCount = await getSessionCountForDomain(session.domain);
        if (remainingCount === 0) {
            await removeInitiatorRule(session.domain);
        }
    }
}
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return '';
    }
}
// End session when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await endSession(tabId);
    await revokeAllAuthorizationsForTab(tabId);
});
// End session when navigating away from the tracked domain
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
    if (changeInfo.url) {
        const session = await getActiveSessionByTab(tabId);
        if (session) {
            const aliases = await getDomainAliases();
            const currentDomain = extractDomain(changeInfo.url);
            const normalizedCurrent = getRootDomain(currentDomain, aliases);
            const normalizedSession = getRootDomain(session.domain, aliases);
            const isStillOnDomain = normalizedCurrent === normalizedSession ||
                currentDomain.endsWith('.' + session.domain);
            if (!isStillOnDomain) {
                await endSession(tabId);
            }
        }
    }
});
// Track active time: pause/resume when switching tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const sessions = await getActiveSessions();
    for (const session of sessions) {
        if (session.tabId === activeInfo.tabId) {
            await setSessionActive(session.tabId, true);
        }
        else {
            // Check if this tab is in the same window
            try {
                const tab = await chrome.tabs.get(session.tabId);
                if (tab.windowId === activeInfo.windowId) {
                    await setSessionActive(session.tabId, false);
                }
            }
            catch {
                // Tab doesn't exist anymore
            }
        }
    }
});
// Track active time: pause all when window loses focus, resume when gains focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const sessions = await getActiveSessions();
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // All windows lost focus - pause all sessions
        for (const session of sessions) {
            await setSessionActive(session.tabId, false);
        }
    }
    else {
        // A window gained focus - activate the active tab's session if tracked
        const [activeTab] = await chrome.tabs.query({ active: true, windowId });
        if (activeTab?.id) {
            const session = sessions.find(s => s.tabId === activeTab.id);
            if (session) {
                await setSessionActive(activeTab.id, true);
            }
        }
    }
});
// Capture full URL before redirect to warning page (fixes URL truncation with query params)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0)
        return;
    console.log('[nav] onBeforeNavigate:', {
        tabId: details.tabId,
        url: details.url,
    });
    const config = await getGreylist();
    const aliases = await getDomainAliases();
    const expandedDomains = expandDomainsWithAliases(config.domains, aliases);
    const hostname = extractDomain(details.url);
    const isGreylisted = expandedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    if (isGreylisted) {
        console.log('[nav] Greylisted domain detected:', hostname);
        pendingNavigations.set(details.tabId, details.url);
        setTimeout(() => pendingNavigations.delete(details.tabId), 30000);
    }
});
// Auto-authorize child tabs opened from authorized parent tabs (same domain)
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
    const { sourceTabId, tabId, url } = details;
    console.log('[nav] onCreatedNavigationTarget:', {
        sourceTabId,
        tabId,
        url,
    });
    const sourceSession = await getActiveSessionByTab(sourceTabId);
    console.log('[nav] Source session:', sourceSession);
    if (!sourceSession)
        return;
    const aliases = await getDomainAliases();
    const targetHostname = extractDomain(url);
    const targetRoot = getRootDomain(targetHostname, aliases);
    const sessionRoot = getRootDomain(sourceSession.domain, aliases);
    console.log('[nav] Domain comparison:', { targetHostname, targetRoot, sessionRoot });
    if (targetRoot === sessionRoot) {
        console.log('[nav] Authorizing child tab for same domain');
        await authorizeTabForDomain(tabId, sourceSession.domain);
        await addActiveSession({
            logId: sourceSession.logId,
            tabId,
            domain: sourceSession.domain,
            startTime: Date.now(),
            accumulatedTime: 0,
            lastActiveTime: Date.now(),
        });
    }
});
