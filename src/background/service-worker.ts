import {
	initializeStorage,
	getGreylist,
	addActiveSession,
	removeActiveSession,
	getActiveSessionByTab,
	updateLogDuration,
} from '../lib/storage.js';
import { updateGreylistRules, temporarilyAllowDomain } from '../lib/rules.js';
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
			await temporarilyAllowDomain(message.domain);
			await addActiveSession({
				logId: message.logId,
				tabId: message.tabId,
				domain: message.domain,
				startTime: Date.now(),
			});
			sendResponse({ success: true });
		})().catch((error) => sendResponse({ success: false, error: error.message }));
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
		const duration = Date.now() - session.startTime;
		await updateLogDuration(session.logId, duration);
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
chrome.tabs.onRemoved.addListener((tabId) => {
	endSession(tabId);
});

// End session when navigating away from the tracked domain
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
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
