import { addLog, updateLogAction } from '../lib/storage.js';
import type { AllowOnceMessage } from '../lib/types.js';

function isBackForwardNavigation(): boolean {
	const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
	return entries[0]?.type === 'back_forward';
}

// Skip warning page on back/forward navigation to avoid duplicate logging
if (isBackForwardNavigation()) {
	history.back();
}

const domainDisplay = document.getElementById('domain') as HTMLParagraphElement;
const urlDisplay = document.getElementById('url') as HTMLParagraphElement;
const blockButton = document.getElementById('block') as HTMLElement;
const proceedButton = document.getElementById('proceed') as HTMLElement;

async function getOriginalUrl(): Promise<string | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.id) {
		const response = await chrome.runtime.sendMessage({
			type: 'GET_ORIGINAL_URL',
			tabId: tab.id,
		});
		if (response?.url) return response.url;
	}
	// Fallback for simple URLs
	const params = new URLSearchParams(window.location.search);
	return params.get('url');
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

const originalUrl = await getOriginalUrl();

if (!originalUrl) {
	document.body.innerHTML = '<p class="error">No URL specified</p>';
} else {
	const domain = extractDomain(originalUrl);
	domainDisplay.textContent = domain;
	urlDisplay.textContent = originalUrl;

	// Log as blocked immediately - update to proceeded only if user clicks Proceed
	const logId = await addLog({
		timestamp: Date.now(),
		domain,
		fullUrl: originalUrl,
		action: 'blocked',
	});

	blockButton.addEventListener('click', async () => {
		// Already logged as blocked, just navigate away
		if (history.length > 1) {
			history.back();
		} else {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				chrome.tabs.remove(tab.id);
			}
		}
	});

	proceedButton.addEventListener('click', async () => {
		await updateLogAction(logId, 'proceeded');

		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		const tabId = tab?.id ?? 0;

		const message: AllowOnceMessage = {
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
