import { getGreylist, setGreylist, getLogs, getActiveSessions, getAuditLogs } from '../lib/storage.js';
import { updateGreylistRules } from '../lib/rules.js';
const domainsInput = document.getElementById('domains');
const saveButton = document.getElementById('save');
const sortButton = document.getElementById('sort');
const prettierCheckbox = document.getElementById('prettier');
const messageAlert = document.getElementById('message');
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
    messageAlert.textContent = text;
    messageAlert.setAttribute('variant', isError ? 'danger' : 'success');
    messageAlert.open = true;
    setTimeout(() => {
        messageAlert.open = false;
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
prettierCheckbox.addEventListener('sl-change', () => {
    const domains = getCurrentDomains();
    domainsInput.value = formatDomains(domains);
});
domainsInput.addEventListener('keydown', (e) => {
    const ke = e;
    if (ke.key === 'Enter' && (ke.metaKey || ke.ctrlKey)) {
        saveSettings();
    }
});
openShortcutsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
async function getActualShortcut(commandName) {
    const commands = await chrome.commands.getAll();
    const command = commands.find(c => c.name === commandName);
    return command?.shortcut || null;
}
async function loadShortcuts() {
    const shortcut = await getActualShortcut('copy-clean-url');
    if (shortcut) {
        shortcutCopyCleanUrl.textContent = shortcut;
        shortcutCopyCleanUrl.classList.remove('not-set');
    }
    else {
        shortcutCopyCleanUrl.textContent = 'Not set';
        shortcutCopyCleanUrl.classList.add('not-set');
    }
}
loadShortcuts();
// Debug section
const copyDebugButton = document.getElementById('copy-debug');
const debugOutput = document.getElementById('debug-output');
async function gatherDebugInfo() {
    const [logs, sessions, auditLogs, dynamicRules, sessionRules, greylist] = await Promise.all([
        getLogs(),
        getActiveSessions(),
        getAuditLogs(),
        chrome.declarativeNetRequest.getDynamicRules(),
        chrome.declarativeNetRequest.getSessionRules(),
        getGreylist(),
    ]);
    const formatRule = (r) => ({
        id: r.id,
        priority: r.priority,
        action: r.action.type,
        regexFilter: r.condition?.regexFilter,
        tabIds: r.condition?.tabIds,
    });
    const info = {
        timestamp: new Date().toISOString(),
        greylist: greylist.domains,
        activeSessions: sessions,
        recentLogs: logs.slice(0, 20),
        auditLogs: auditLogs.slice(0, 10),
        dynamicRules: dynamicRules.map(formatRule),
        sessionRules: sessionRules.map(formatRule),
    };
    return JSON.stringify(info, null, 2);
}
copyDebugButton.addEventListener('click', async () => {
    const info = await gatherDebugInfo();
    debugOutput.textContent = info;
    debugOutput.hidden = false;
    await navigator.clipboard.writeText(info);
    copyDebugButton.textContent = 'Copied!';
    setTimeout(() => copyDebugButton.textContent = 'Copy Debug Info', 2000);
});
// Active nav highlighting based on scroll position
const navLinks = document.querySelectorAll('.sidebar-nav a');
const sections = document.querySelectorAll('.settings-content section');
function updateActiveNav() {
    const scrollY = window.scrollY;
    let currentSection = sections[0];
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        if (scrollY >= sectionTop) {
            currentSection = section;
        }
    });
    navLinks.forEach(link => link.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-nav a[href="#${currentSection.id}"]`);
    activeLink?.classList.add('active');
}
window.addEventListener('scroll', updateActiveNav);
updateActiveNav();
loadSettings();
