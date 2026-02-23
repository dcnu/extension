import type { ActivateFocusModeMessage } from '../lib/types.js';

type SlInput = HTMLElement & { value: string };
type SlAlert = HTMLElement & { open: boolean };

const minutesInput = document.getElementById('minutes') as SlInput;
const startButton = document.getElementById('start') as HTMLElement;
const errorAlert = document.getElementById('error') as SlAlert;

function showError(text: string): void {
	errorAlert.textContent = text;
	errorAlert.open = true;
}

async function activate(): Promise<void> {
	const minutes = parseInt(minutesInput.value, 10);
	if (!minutes || minutes < 1 || minutes > 480) {
		showError('Enter a duration between 1 and 480 minutes');
		return;
	}
	const msg: ActivateFocusModeMessage = { type: 'ACTIVATE_FOCUS_MODE', durationMinutes: minutes };
	await chrome.runtime.sendMessage(msg);
	window.close();
}

startButton.addEventListener('click', activate);

minutesInput.addEventListener('keydown', (e: Event) => {
	if ((e as KeyboardEvent).key === 'Enter') activate();
});
