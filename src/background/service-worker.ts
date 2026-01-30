import {
	initializeStorage,
	getGreylist,
	addActiveSession,
	removeActiveSession,
	getActiveSessionByTab,
	getActiveSessions,
	setSessionActive,
	updateLogDuration,
} from '../lib/storage.js';
import { updateGreylistRules, authorizeTabForDomain, revokeTabAuthorization, revokeAllAuthorizationsForTab } from '../lib/rules.js';
import { cleanUrl } from '../lib/url-cleaner.js';
import type { ExtensionMessage } from '../lib/types.js';

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

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
	if (message.type === 'ALLOW_ONCE') {
		(async () => {
			try {
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
			} catch (error) {
				console.error('ALLOW_ONCE failed:', error);
				sendResponse({ success: false, error: String(error) });
			}
		})();
		return true;
	}
});

async function copyToClipboard(text: string): Promise<void> {
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
	} finally {
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
async function endSession(tabId: number): Promise<void> {
	const session = await removeActiveSession(tabId);
	if (session) {
		let duration = session.accumulatedTime;
		// Add any time since last activation
		if (session.lastActiveTime) {
			duration += Date.now() - session.lastActiveTime;
		}
		await updateLogDuration(session.logId, duration);
		await revokeTabAuthorization(tabId, session.domain);
	}
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
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
			const currentDomain = extractDomain(changeInfo.url);
			const isStillOnDomain = currentDomain === session.domain ||
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
		} else {
			// Check if this tab is in the same window
			try {
				const tab = await chrome.tabs.get(session.tabId);
				if (tab.windowId === activeInfo.windowId) {
					await setSessionActive(session.tabId, false);
				}
			} catch {
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
	} else {
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
