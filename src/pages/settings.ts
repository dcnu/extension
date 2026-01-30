import { getGreylist, setGreylist, getLogs, getActiveSessions, getAuditLogs } from '../lib/storage.js';
import { updateGreylistRules } from '../lib/rules.js';

const domainsInput = document.getElementById('domains') as HTMLTextAreaElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const sortButton = document.getElementById('sort') as HTMLButtonElement;
const prettierCheckbox = document.getElementById('prettier') as HTMLInputElement;
const messageDiv = document.getElementById('message') as HTMLDivElement;
const openShortcutsLink = document.getElementById('open-shortcuts') as HTMLAnchorElement;
const shortcutCopyCleanUrl = document.getElementById('shortcut-copy-clean-url') as HTMLElement;

function parseDomains(input: string): string[] {
	return input
		.split(/[,\n]/)
		.map(d => d.trim().toLowerCase())
		.filter(d => d.length > 0)
		.filter(d => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d));
}

function showMessage(text: string, isError: boolean = false): void {
	messageDiv.textContent = text;
	messageDiv.className = `message ${isError ? 'error' : 'success'}`;
	messageDiv.hidden = false;
	setTimeout(() => {
		messageDiv.hidden = true;
	}, 3000);
}

function formatDomains(domains: string[]): string {
	return prettierCheckbox.checked ? domains.join('\n') : domains.join(', ');
}

function getCurrentDomains(): string[] {
	return [...new Set(parseDomains(domainsInput.value))];
}

async function loadSettings(): Promise<void> {
	const config = await getGreylist();
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

async function getActualShortcut(commandName: string): Promise<string | null> {
	const commands = await chrome.commands.getAll();
	const command = commands.find(c => c.name === commandName);
	return command?.shortcut || null;
}

async function loadShortcuts(): Promise<void> {
	const shortcut = await getActualShortcut('copy-clean-url');
	if (shortcut) {
		shortcutCopyCleanUrl.textContent = shortcut;
		shortcutCopyCleanUrl.classList.remove('not-set');
	} else {
		shortcutCopyCleanUrl.textContent = 'Not set';
		shortcutCopyCleanUrl.classList.add('not-set');
	}
}

loadShortcuts();

// Debug section
const copyDebugButton = document.getElementById('copy-debug') as HTMLButtonElement;
const debugOutput = document.getElementById('debug-output') as HTMLPreElement;

async function gatherDebugInfo(): Promise<string> {
	const [logs, sessions, auditLogs, dynamicRules, sessionRules, greylist] = await Promise.all([
		getLogs(),
		getActiveSessions(),
		getAuditLogs(),
		chrome.declarativeNetRequest.getDynamicRules(),
		chrome.declarativeNetRequest.getSessionRules(),
		getGreylist(),
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
