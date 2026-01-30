import type { GreylistConfig, NavigationLog, ActiveSession, AuditLog } from './types.js';

const STORAGE_KEYS = {
	GREYLIST: 'greylist',
	LOGS: 'logs',
	ACTIVE_SESSIONS: 'activeSessions',
	AUDIT_LOGS: 'auditLogs',
} as const;

export async function getGreylist(): Promise<GreylistConfig> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.GREYLIST);
	return result[STORAGE_KEYS.GREYLIST] ?? { domains: [] };
}

export async function setGreylist(config: GreylistConfig): Promise<void> {
	await chrome.storage.local.set({ [STORAGE_KEYS.GREYLIST]: config });
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

export async function clearLogs(): Promise<void> {
	await addAuditLog({ event: 'stats_cleared' });
	await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
}

// Active sessions for time tracking
export async function getActiveSessions(): Promise<ActiveSession[]> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSIONS);
	return result[STORAGE_KEYS.ACTIVE_SESSIONS] ?? [];
}

export async function addActiveSession(session: ActiveSession): Promise<void> {
	const sessions = await getActiveSessions();
	sessions.push(session);
	await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
}

export async function removeActiveSession(tabId: number): Promise<ActiveSession | null> {
	const sessions = await getActiveSessions();
	const index = sessions.findIndex(s => s.tabId === tabId);
	if (index === -1) return null;
	const [removed] = sessions.splice(index, 1);
	await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
	return removed;
}

export async function getActiveSessionByTab(tabId: number): Promise<ActiveSession | null> {
	const sessions = await getActiveSessions();
	return sessions.find(s => s.tabId === tabId) ?? null;
}

export async function setSessionActive(tabId: number, isActive: boolean): Promise<void> {
	const sessions = await getActiveSessions();
	const session = sessions.find(s => s.tabId === tabId);
	if (session) {
		if (isActive) {
			session.lastActiveTime = Date.now();
		} else if (session.lastActiveTime) {
			session.accumulatedTime += Date.now() - session.lastActiveTime;
			session.lastActiveTime = null;
		}
		await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
	}
}

// Audit logs (immutable)
export async function getAuditLogs(): Promise<AuditLog[]> {
	const result = await chrome.storage.local.get(STORAGE_KEYS.AUDIT_LOGS);
	return result[STORAGE_KEYS.AUDIT_LOGS] ?? [];
}

export async function addAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
	const logs = await getAuditLogs();
	const newLog: AuditLog = {
		...log,
		id: crypto.randomUUID(),
		timestamp: Date.now(),
	};
	logs.unshift(newLog);
	await chrome.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: logs });
}

export async function initializeStorage(): Promise<void> {
	const result = await chrome.storage.local.get([
		STORAGE_KEYS.GREYLIST,
		STORAGE_KEYS.LOGS,
		STORAGE_KEYS.ACTIVE_SESSIONS,
		STORAGE_KEYS.AUDIT_LOGS,
	]);
	if (!result[STORAGE_KEYS.GREYLIST]) {
		await setGreylist({ domains: [] });
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
}
