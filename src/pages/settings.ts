import { getGreylist, setGreylist, getCleanOnClose, setCleanOnClose, getLogs, getActiveSessions, getAuditLogs, getDomainAliases, setDomainAliases, getFocusMode, clearFocusMode } from '../lib/storage.js';
import { updateGreylistRules } from '../lib/rules.js';
import type { DomainAlias, ActivateFocusModeMessage } from '../lib/types.js';

type SlTextarea = HTMLElement & { value: string };
type SlCheckbox = HTMLElement & { checked: boolean };
type SlAlert = HTMLElement & { open: boolean };
type SlInput = HTMLElement & { value: string; disabled: boolean };

// Focus mode elements
const focusInactive = document.getElementById('focus-inactive') as HTMLDivElement;
const focusActive = document.getElementById('focus-active') as HTMLDivElement;
const focusMinutesInput = document.getElementById('focus-minutes') as SlInput;
const focusStartButton = document.getElementById('focus-start') as HTMLElement;
const focusEndButton = document.getElementById('focus-end') as HTMLElement;
const focusCountdown = document.getElementById('focus-countdown') as HTMLSpanElement;
const focusMessageAlert = document.getElementById('focus-message') as SlAlert;

let countdownInterval: ReturnType<typeof setInterval> | null = null;

function showFocusMessage(text: string, isError = false): void {
	focusMessageAlert.textContent = text;
	focusMessageAlert.setAttribute('variant', isError ? 'danger' : 'success');
	focusMessageAlert.open = true;
	setTimeout(() => { focusMessageAlert.open = false; }, 3000);
}

function formatCountdown(msRemaining: number): string {
	const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds}s`;
}

function stopCountdown(): void {
	if (countdownInterval !== null) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}
}

function startCountdown(endTime: number): void {
	stopCountdown();
	const tick = (): void => {
		const remaining = endTime - Date.now();
		if (remaining <= 0) {
			stopCountdown();
			loadFocusMode();
			return;
		}
		focusCountdown.textContent = formatCountdown(remaining);
	};
	tick();
	countdownInterval = setInterval(tick, 1000);
}

function applyFocusModeToGreylist(active: boolean): void {
	(domainsInput as SlTextarea & { disabled: boolean }).disabled = active;
	(saveButton as HTMLElement & { disabled: boolean }).disabled = active;
	(sortButton as HTMLElement & { disabled: boolean }).disabled = active;
}

async function loadFocusMode(): Promise<void> {
	const config = await getFocusMode();
	const isActive = config.endTime !== null && config.endTime > Date.now();

	if (isActive && config.endTime !== null) {
		focusInactive.hidden = true;
		focusActive.hidden = false;
		startCountdown(config.endTime);
	} else {
		focusInactive.hidden = false;
		focusActive.hidden = true;
		stopCountdown();
	}
	applyFocusModeToGreylist(isActive);
}

focusStartButton.addEventListener('click', async () => {
	const minutes = parseInt(focusMinutesInput.value, 10);
	if (!minutes || minutes < 1 || minutes > 480) {
		showFocusMessage('Enter a duration between 1 and 480 minutes', true);
		return;
	}
	const msg: ActivateFocusModeMessage = { type: 'ACTIVATE_FOCUS_MODE', durationMinutes: minutes };
	await chrome.runtime.sendMessage(msg);
	focusMinutesInput.value = '';
	await loadFocusMode();
	showFocusMessage(`Focus mode active for ${minutes} minute${minutes !== 1 ? 's' : ''}`);
});

focusEndButton.addEventListener('click', async () => {
	await clearFocusMode();
	await chrome.alarms.clear('focus-mode-end');
	await loadFocusMode();
	showFocusMessage('Focus mode ended');
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && 'focusMode' in changes) {
		loadFocusMode();
	}
});

const domainsInput = document.getElementById('domains') as SlTextarea;
const saveButton = document.getElementById('save') as HTMLElement;
const sortButton = document.getElementById('sort') as HTMLElement;
const prettierCheckbox = document.getElementById('prettier') as SlCheckbox;
const messageAlert = document.getElementById('message') as SlAlert;
const openShortcutsLink = document.getElementById('open-shortcuts') as HTMLAnchorElement;
const shortcutCopyCleanUrl = document.getElementById('shortcut-copy-clean-url') as HTMLElement;
const shortcutActivateFocusMode = document.getElementById('shortcut-activate-focus-mode') as HTMLElement;

function parseDomains(input: string): string[] {
	return input
		.split(/[,\n]/)
		.map(d => d.trim().toLowerCase())
		.filter(d => d.length > 0)
		.filter(d => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d));
}

function showMessage(text: string, isError: boolean = false): void {
	messageAlert.textContent = text;
	messageAlert.setAttribute('variant', isError ? 'danger' : 'success');
	messageAlert.open = true;
	setTimeout(() => {
		messageAlert.open = false;
	}, 3000);
}

function formatDomains(domains: string[]): string {
	return prettierCheckbox.checked ? domains.join(',\n') : domains.join(', ');
}

function getCurrentDomains(): string[] {
	return [...new Set(parseDomains(domainsInput.value))];
}

async function loadSettings(): Promise<void> {
	const [config, { onePerLine }] = await Promise.all([
		getGreylist(),
		chrome.storage.local.get('onePerLine'),
	]);
	prettierCheckbox.checked = onePerLine ?? false;
	domainsInput.value = formatDomains(config.domains);
}

async function saveSettings(): Promise<void> {
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

domainsInput.addEventListener('keydown', (e: Event) => {
	const ke = e as KeyboardEvent;
	if (ke.key === 'Enter' && (ke.metaKey || ke.ctrlKey)) {
		saveSettings();
	}
});

// Clean on Close section
const cleanDomainsInput = document.getElementById('clean-domains') as SlTextarea;
const cleanSaveButton = document.getElementById('clean-save') as HTMLElement;
const cleanSortButton = document.getElementById('clean-sort') as HTMLElement;
const cleanPrettierCheckbox = document.getElementById('clean-prettier') as SlCheckbox;
const cleanMessageAlert = document.getElementById('clean-message') as SlAlert;

function showCleanMessage(text: string, isError: boolean = false): void {
	cleanMessageAlert.textContent = text;
	cleanMessageAlert.setAttribute('variant', isError ? 'danger' : 'success');
	cleanMessageAlert.open = true;
	setTimeout(() => {
		cleanMessageAlert.open = false;
	}, 3000);
}

function formatCleanDomains(domains: string[]): string {
	return cleanPrettierCheckbox.checked ? domains.join(',\n') : domains.join(', ');
}

function getCurrentCleanDomains(): string[] {
	return [...new Set(parseDomains(cleanDomainsInput.value))];
}

async function loadCleanSettings(): Promise<void> {
	const [config, { cleanOnePerLine }] = await Promise.all([
		getCleanOnClose(),
		chrome.storage.local.get('cleanOnePerLine'),
	]);
	cleanPrettierCheckbox.checked = cleanOnePerLine ?? false;
	cleanDomainsInput.value = formatCleanDomains(config.domains);
}

async function saveCleanSettings(): Promise<void> {
	const rawInput = cleanDomainsInput.value;
	const domains = [...new Set(parseDomains(rawInput))];

	if (rawInput.trim() && domains.length === 0) {
		showCleanMessage('No valid domains found. Use format: example.com', true);
		return;
	}

	await setCleanOnClose({ domains });
	cleanDomainsInput.value = formatCleanDomains(domains);
	showCleanMessage(`Saved ${domains.length} domain${domains.length !== 1 ? 's' : ''}`);
}

cleanSaveButton.addEventListener('click', saveCleanSettings);

cleanSortButton.addEventListener('click', () => {
	const domains = getCurrentCleanDomains().sort((a, b) => a.localeCompare(b));
	cleanDomainsInput.value = formatCleanDomains(domains);
});

cleanPrettierCheckbox.addEventListener('sl-change', async () => {
	await chrome.storage.local.set({ cleanOnePerLine: cleanPrettierCheckbox.checked });
	const domains = getCurrentCleanDomains();
	cleanDomainsInput.value = formatCleanDomains(domains);
});

cleanDomainsInput.addEventListener('keydown', (e: Event) => {
	const ke = e as KeyboardEvent;
	if (ke.key === 'Enter' && (ke.metaKey || ke.ctrlKey)) {
		saveCleanSettings();
	}
});

loadCleanSettings();

openShortcutsLink.addEventListener('click', (e) => {
	e.preventDefault();
	chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

async function getActualShortcut(commandName: string): Promise<string | null> {
	const commands = await chrome.commands.getAll();
	const command = commands.find(c => c.name === commandName);
	return command?.shortcut || null;
}

async function loadShortcuts(): Promise<void> {
	const [shortcutCopy, shortcutFocus] = await Promise.all([
		getActualShortcut('copy-clean-url'),
		getActualShortcut('activate-focus-mode'),
	]);
	if (shortcutCopy) {
		shortcutCopyCleanUrl.textContent = shortcutCopy;
		shortcutCopyCleanUrl.classList.remove('not-set');
	} else {
		shortcutCopyCleanUrl.textContent = 'Not set';
		shortcutCopyCleanUrl.classList.add('not-set');
	}
	if (shortcutFocus) {
		shortcutActivateFocusMode.textContent = shortcutFocus;
		shortcutActivateFocusMode.classList.remove('not-set');
	} else {
		shortcutActivateFocusMode.textContent = 'Not set';
		shortcutActivateFocusMode.classList.add('not-set');
	}
}

loadShortcuts();

// Alias section
const aliasList = document.getElementById('alias-list') as HTMLDivElement;
const aliasFromInput = document.getElementById('alias-from') as SlInput;
const aliasToInput = document.getElementById('alias-to') as SlInput;
const aliasAddButton = document.getElementById('alias-add') as HTMLElement;

function isValidDomain(domain: string): boolean {
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain.toLowerCase());
}

function renderAliases(aliases: DomainAlias[]): void {
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
			const index = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10);
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

async function loadAliases(): Promise<void> {
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
const copyDebugButton = document.getElementById('copy-debug') as HTMLElement;
const debugOutput = document.getElementById('debug-output') as HTMLPreElement;

async function gatherDebugInfo(): Promise<string> {
	const [logs, sessions, auditLogs, dynamicRules, sessionRules, greylist, cleanOnClose, aliases] = await Promise.all([
		getLogs(),
		getActiveSessions(),
		getAuditLogs(),
		chrome.declarativeNetRequest.getDynamicRules(),
		chrome.declarativeNetRequest.getSessionRules(),
		getGreylist(),
		getCleanOnClose(),
		getDomainAliases(),
	]);

	const formatRule = (r: chrome.declarativeNetRequest.Rule) => ({
		id: r.id,
		priority: r.priority,
		action: r.action.type,
		regexFilter: r.condition?.regexFilter,
		tabIds: r.condition?.tabIds,
	});

	const info = {
		timestamp: new Date().toISOString(),
		greylist: greylist.domains,
		cleanOnClose: cleanOnClose.domains,
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
const initialHash = window.location.hash || '#focus-mode';
const initialLink = document.querySelector(`.sidebar-nav a[href="${initialHash}"]`);
initialLink?.classList.add('active');

loadSettings();
loadFocusMode();
