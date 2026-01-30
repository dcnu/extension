import { getGreylist, setGreylist } from '../lib/storage.js';
import { updateGreylistRules } from '../lib/rules.js';
const domainsInput = document.getElementById('domains');
const saveButton = document.getElementById('save');
const sortButton = document.getElementById('sort');
const prettierCheckbox = document.getElementById('prettier');
const messageDiv = document.getElementById('message');
const openShortcutsLink = document.getElementById('open-shortcuts');
const shortcutCopyCleanUrl = document.getElementById('shortcut-copy-clean-url');
function parseDomains(input) {
    return input
        .split(/[,\n]/)
        .map(d => d.trim().toLowerCase())
        .filter(d => d.length > 0)
        .filter(d => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d));
}
function showMessage(text, isError = false) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${isError ? 'error' : 'success'}`;
    messageDiv.hidden = false;
    setTimeout(() => {
        messageDiv.hidden = true;
    }, 3000);
}
function formatDomains(domains) {
    return prettierCheckbox.checked ? domains.join('\n') : domains.join(', ');
}
function getCurrentDomains() {
    return [...new Set(parseDomains(domainsInput.value))];
}
async function loadSettings() {
    const config = await getGreylist();
    domainsInput.value = formatDomains(config.domains);
}
async function saveSettings() {
    const rawInput = domainsInput.value;
    const domains = [...new Set(parseDomains(rawInput))];
    if (rawInput.trim() && domains.length === 0) {
        showMessage('No valid domains found. Use format: example.com', true);
        return;
    }
    await setGreylist({ domains });
    await updateGreylistRules(domains);
    domainsInput.value = formatDomains(domains);
    showMessage(`Saved ${domains.length} domain${domains.length !== 1 ? 's' : ''}`);
}
saveButton.addEventListener('click', saveSettings);
sortButton.addEventListener('click', () => {
    const domains = getCurrentDomains().sort((a, b) => a.localeCompare(b));
    domainsInput.value = formatDomains(domains);
});
prettierCheckbox.addEventListener('change', () => {
    const domains = getCurrentDomains();
    domainsInput.value = formatDomains(domains);
});
domainsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        saveSettings();
    }
});
openShortcutsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
// Show platform-appropriate shortcut
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
shortcutCopyCleanUrl.textContent = isMac ? '⌘⇧L' : 'Ctrl+Shift+L';
// Active nav highlighting based on scroll position
const navLinks = document.querySelectorAll('.sidebar-nav a');
const sections = document.querySelectorAll('.settings-content section');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            navLinks.forEach(link => link.classList.remove('active'));
            const activeLink = document.querySelector(`.sidebar-nav a[href="#${entry.target.id}"]`);
            activeLink?.classList.add('active');
        }
    });
}, { threshold: 0.5 });
sections.forEach(section => observer.observe(section));
loadSettings();
