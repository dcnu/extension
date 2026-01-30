chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === 'COPY_TEXT') {
		copyText(message.text)
			.then(() => sendResponse({ success: true }))
			.catch((error) => sendResponse({ success: false, error: String(error) }));
		return true;
	}
});

async function copyText(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		// Fallback for older browsers
		const textarea = document.getElementById('clipboard-area') as HTMLTextAreaElement;
		textarea.value = text;
		textarea.select();
		document.execCommand('copy');
	}
}
