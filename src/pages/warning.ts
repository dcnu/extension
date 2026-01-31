import { addLog } from '../lib/storage.js';
import type { AllowOnceMessage, LogBlockMessage } from '../lib/types.js';

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

function getUrlFromParams(): string | null {
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

const originalUrl = getUrlFromParams();

if (!originalUrl) {
	document.body.innerHTML = '<p class="error">No URL specified</p>';
} else {
	const domain = extractDomain(originalUrl);
	domainDisplay.textContent = domain;
	urlDisplay.textContent = originalUrl;

	let actionTaken = false;

	// Log as blocked if user closes tab without clicking Block or Proceed
	window.addEventListener('beforeunload', () => {
		if (!actionTaken) {
			const message: LogBlockMessage = {
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
		actionTaken = true;
		const logId = await addLog({
			timestamp: Date.now(),
			domain,
			fullUrl: originalUrl,
			action: 'proceeded',
		});

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
