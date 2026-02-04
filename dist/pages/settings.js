import { getGreylist, setGreylist, getLogs, getActiveSessions, getAuditLogs, getDomainAliases, setDomainAliases } from '../lib/storage.js';
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
    return prettierCheckbox.checked ? domains.join(',\n') : domains.join(', ');
}
function getCurrentDomains() {
    return [...new Set(parseDomains(domainsInput.value))];
}
async function loadSettings() {
    const [config, { onePerLine }] = await Promise.all([
        getGreylist(),
        chrome.storage.local.get('onePerLine'),
    ]);
    prettierCheckbox.checked = onePerLine ?? false;
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
prettierCheckbox.addEventListener('sl-change', async () => {
    await chrome.storage.local.set({ onePerLine: prettierCheckbox.checked });
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
// Alias section
const aliasList = document.getElementById('alias-list');
const aliasFromInput = document.getElementById('alias-from');
const aliasToInput = document.getElementById('alias-to');
const aliasAddButton = document.getElementById('alias-add');
function isValidDomain(domain) {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain.toLowerCase());
}
function renderAliases(aliases) {
    if (aliases.length === 0) {
        aliasList.innerHTML = '<p class="help-text">No aliases configured</p>';
        return;
    }
    aliasList.innerHTML = aliases.map((alias, index) => `
		<div class="alias-item" data-index="${index}">
			<span class="alias-from">${alias.from}</span>
			<span class="alias-arrow">→</span>
			<span class="alias-to">${alias.to}</span>
			<sl-button class="alias-remove" size="small" variant="text" data-index="${index}">Remove</sl-button>
		</div>
	`).join('');
    aliasList.querySelectorAll('.alias-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.currentTarget.dataset.index, 10);
            const currentAliases = await getDomainAliases();
            currentAliases.splice(index, 1);
            await setDomainAliases(currentAliases);
            renderAliases(currentAliases);
            // Refresh greylist rules to update alias expansion
            const config = await getGreylist();
            await updateGreylistRules(config.domains);
        });
    });
}
async function loadAliases() {
    const aliases = await getDomainAliases();
    renderAliases(aliases);
}
aliasAddButton.addEventListener('click', async () => {
    const from = aliasFromInput.value.trim().toLowerCase();
    const to = aliasToInput.value.trim().toLowerCase();
    if (!from || !to) {
        showMessage('Both fields are required', true);
        return;
    }
    if (!isValidDomain(from) || !isValidDomain(to)) {
        showMessage('Invalid domain format', true);
        return;
    }
    if (from === to) {
        showMessage('Domains must be different', true);
        return;
    }
    const aliases = await getDomainAliases();
    if (aliases.some(a => a.from === from)) {
        showMessage(`Alias for ${from} already exists`, true);
        return;
    }
    aliases.push({ from, to });
    await setDomainAliases(aliases);
    renderAliases(aliases);
    // Refresh greylist rules to update alias expansion
    const config = await getGreylist();
    await updateGreylistRules(config.domains);
    aliasFromInput.value = '';
    aliasToInput.value = '';
    showMessage('Alias added');
});
loadAliases();
// Debug section
const copyDebugButton = document.getElementById('copy-debug');
const debugOutput = document.getElementById('debug-output');
async function gatherDebugInfo() {
    const [logs, sessions, auditLogs, dynamicRules, sessionRules, greylist, aliases] = await Promise.all([
        getLogs(),
        getActiveSessions(),
        getAuditLogs(),
        chrome.declarativeNetRequest.getDynamicRules(),
        chrome.declarativeNetRequest.getSessionRules(),
        getGreylist(),
        getDomainAliases(),
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
        domainAliases: aliases,
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
// Active nav highlighting based on click
const navLinks = document.querySelectorAll('.sidebar-nav a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});
// Set initial active state based on hash or first item
const initialHash = window.location.hash || '#greylist';
const initialLink = document.querySelector(`.sidebar-nav a[href="${initialHash}"]`);
initialLink?.classList.add('active');
loadSettings();
