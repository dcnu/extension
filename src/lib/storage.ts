import type { GreylistConfig, CleanOnCloseConfig, NavigationLog, ActiveSession, AuditLog, DomainAlias } from './types.js';

const STORAGE_KEYS = {
	GREYLIST: 'greylist',
	CLEAN_ON_CLOSE: 'cleanOnClose',
	LOGS: 'logs',
	ACTIVE_SESSIONS: 'activeSessions',
	AUDIT_LOGS: 'auditLogs',
	DOMAIN_ALIASES: 'domainAliases',
} as const;

const DEFAULT_ALIASES: DomainAlias[] = [
	{ from: 'twitter.com', to: 'x.com' },
];

// Config caches — populated lazily, invalidated when storage changes
let _greylist: GreylistConfig | null = null;
let _cleanOnClose: CleanOnCloseConfig | null = null;
let _aliases: DomainAlias[] | null = null;

// Session cache — Map<tabId, ActiveSession> for O(1) access without storage reads
let _sessions: Map<number, ActiveSession> | null = null;

// Invalidate config caches when another context writes to storage
chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local') return;
	if ('greylist' in changes) _greylist = null;
	if ('cleanOnClose' in changes) _cleanOnClose = null;
	if ('domainAliases' in changes) _aliases = null;
});

export async function getGreylist(): Promise<GreylistConfig> {
	if (!_greylist) {
		const result = await chrome.storage.local.get(STORAGE_KEYS.GREYLIST);
		_greylist = result[STORAGE_KEYS.GREYLIST] ?? { domains: [] };
	}
	return _greylist!;
}

export async function setGreylist(config: GreylistConfig): Promise<void> {
	_greylist = null;
	await chrome.storage.local.set({ [STORAGE_KEYS.GREYLIST]: config });
}

export async function getCleanOnClose(): Promise<CleanOnCloseConfig> {
	if (!_cleanOnClose) {
		const result = await chrome.storage.local.get(STORAGE_KEYS.CLEAN_ON_CLOSE);
		_cleanOnClose = result[STORAGE_KEYS.CLEAN_ON_CLOSE] ?? { domains: [] };
	}
	return _cleanOnClose!;
}

export async function setCleanOnClose(config: CleanOnCloseConfig): Promise<void> {
	_cleanOnClose = null;
	await chrome.storage.local.set({ [STORAGE_KEYS.CLEAN_ON_CLOSE]: config });
}

export async function getLogs(): Promise<NavigationLog[]> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
	return result[STORAGE_KEYS.LOGS] ?? [];
}

export async function addLog(log: Omit<NavigationLog, 'id'>): Promise<string> {
	const logs = await getLogs();
	const id = crypto.randomUUID();
	const newLog: NavigationLog = {
		...log,
		id,
	};
	logs.unshift(newLog);
	await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
	return id;
}

export async function updateLogDuration(logId: string, duration: number): Promise<void> {
	const logs = await getLogs();
	const log = logs.find(l => l.id === logId);
	if (log) {
		log.duration = duration;
		await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
	}
}

export async function updateLogAction(logId: string, action: 'blocked' | 'proceeded'): Promise<void> {
	const logs = await getLogs();
	const log = logs.find(l => l.id === logId);
	if (log) {
		log.action = action;
		await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
	}
}

export async function clearLogs(): Promise<void> {
	await addAuditLog({ event: 'stats_cleared' });
	await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
}

// Session cache helpers
async function ensureSessions(): Promise<Map<number, ActiveSession>> {
	if (!_sessions) {
		const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSIONS);
		const sessions: ActiveSession[] = result[STORAGE_KEYS.ACTIVE_SESSIONS] ?? [];
		_sessions = new Map(sessions.map(s => [s.tabId, s]));
	}
	return _sessions;
}

async function persistSessions(): Promise<void> {
	if (_sessions) {
		await chrome.storage.local.set({
			[STORAGE_KEYS.ACTIVE_SESSIONS]: [..._sessions.values()],
		});
	}
}

export async function getActiveSessions(): Promise<ActiveSession[]> {
	return [...(await ensureSessions()).values()];
}

export async function addActiveSession(session: ActiveSession): Promise<void> {
	const map = await ensureSessions();
	map.set(session.tabId, session);
	await persistSessions();
}

export async function removeActiveSession(tabId: number): Promise<ActiveSession | null> {
	const map = await ensureSessions();
	const session = map.get(tabId) ?? null;
	if (session) {
		map.delete(tabId);
		await persistSessions();
	}
	return session;
}

export async function getActiveSessionByTab(tabId: number): Promise<ActiveSession | null> {
	const map = await ensureSessions();
	return map.get(tabId) ?? null;
}

export async function getSessionCountForDomain(domain: string): Promise<number> {
	const map = await ensureSessions();
	let count = 0;
	for (const s of map.values()) {
		if (s.domain === domain) count++;
	}
	return count;
}

export async function setSessionActive(tabId: number, isActive: boolean): Promise<void> {
	const map = await ensureSessions();
	const session = map.get(tabId);
	if (!session) return;
	if (isActive) {
		// Mark active — no storage write needed; final duration computed at session end
		session.lastActiveTime = Date.now();
	} else if (session.lastActiveTime) {
		// Accumulate elapsed time and persist so it survives a service worker restart
		session.accumulatedTime += Date.now() - session.lastActiveTime;
		session.lastActiveTime = null;
		await persistSessions();
	}
}

// Audit logs — pruning deferred to read time
const MAX_AUDIT_LOG_ENTRIES = 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getAuditLogs(): Promise<AuditLog[]> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.AUDIT_LOGS);
	const logs: AuditLog[] = result[STORAGE_KEYS.AUDIT_LOGS] ?? [];
	const now = Date.now();
	return logs.filter(l => now - l.timestamp < SEVEN_DAYS_MS);
}

export async function addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.AUDIT_LOGS);
	const logs: AuditLog[] = result[STORAGE_KEYS.AUDIT_LOGS] ?? [];
	const newLog: AuditLog = {
		...log,
		id: crypto.randomUUID(),
		timestamp: Date.now(),
	};
	logs.unshift(newLog);
	await chrome.storage.local.set({
		[STORAGE_KEYS.AUDIT_LOGS]: logs.slice(0, MAX_AUDIT_LOG_ENTRIES),
	});
}

// Domain aliases
export async function getDomainAliases(): Promise<DomainAlias[]> {
	if (!_aliases) {
		const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_ALIASES);
		_aliases = result[STORAGE_KEYS.DOMAIN_ALIASES] ?? DEFAULT_ALIASES;
	}
	return _aliases!;
}

export async function setDomainAliases(aliases: DomainAlias[]): Promise<void> {
	_aliases = null;
	await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_ALIASES]: aliases });
}

export async function initializeStorage(): Promise<void> {
	const result = await chrome.storage.local.get([
		STORAGE_KEYS.GREYLIST,
		STORAGE_KEYS.CLEAN_ON_CLOSE,
		STORAGE_KEYS.LOGS,
		STORAGE_KEYS.ACTIVE_SESSIONS,
		STORAGE_KEYS.AUDIT_LOGS,
		STORAGE_KEYS.DOMAIN_ALIASES,
	]);
	if (!result[STORAGE_KEYS.GREYLIST]) {
		await setGreylist({ domains: [] });
	}
	if (!result[STORAGE_KEYS.CLEAN_ON_CLOSE]) {
		await setCleanOnClose({ domains: [] });
	}
	if (!result[STORAGE_KEYS.LOGS]) {
		await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
	}
	if (!result[STORAGE_KEYS.ACTIVE_SESSIONS]) {
		await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: [] });
	}
	if (!result[STORAGE_KEYS.AUDIT_LOGS]) {
		await chrome.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: [] });
	}
	if (!result[STORAGE_KEYS.DOMAIN_ALIASES]) {
		await setDomainAliases(DEFAULT_ALIASES);
	}
}
