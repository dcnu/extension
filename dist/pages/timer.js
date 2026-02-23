const minutesInput = document.getElementById('minutes');
const startButton = document.getElementById('start');
const errorAlert = document.getElementById('error');
function showError(text) {
    errorAlert.textContent = text;
    errorAlert.open = true;
}
async function activate() {
    const minutes = parseInt(minutesInput.value, 10);
    if (!minutes || minutes < 1 || minutes > 480) {
        showError('Enter a duration between 1 and 480 minutes');
        return;
    }
    const msg = { type: 'ACTIVATE_FOCUS_MODE', durationMinutes: minutes };
    await chrome.runtime.sendMessage(msg);
    window.close();
}
startButton.addEventListener('click', activate);
minutesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')
        activate();
});
export {};
