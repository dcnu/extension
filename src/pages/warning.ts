import { addLog } from '../lib/storage.js';
import type { AllowOnceMessage } from '../lib/types.js';

const domainDisplay = document.getElementById('domain') as HTMLParagraphElement;
const urlDisplay = document.getElementById('url') as HTMLParagraphElement;
const blockButton = document.getElementById('block') as HTMLButtonElement;
const proceedButton = document.getElementById('proceed') as HTMLButtonElement;

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

	blockButton.addEventListener('click', async () => {
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

		const response = await chrome.runtime.sendMessage(message);
		if (response?.success) {
			window.location.href = originalUrl;
		}
	});
}
