const STORAGE_KEYS = {
    GREYLIST: 'greylist',
    LOGS: 'logs',
    ACTIVE_SESSIONS: 'activeSessions',
    AUDIT_LOGS: 'auditLogs',
};
export async function getGreylist() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.GREYLIST);
    return result[STORAGE_KEYS.GREYLIST] ?? { domains: [] };
}
export async function setGreylist(config) {
    await chrome.storage.local.set({ [STORAGE_KEYS.GREYLIST]: config });
}
export async function getLogs() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
    return result[STORAGE_KEYS.LOGS] ?? [];
}
export async function addLog(log) {
    const logs = await getLogs();
    const id = crypto.randomUUID();
    const newLog = {
        ...log,
        id,
    };
    logs.unshift(newLog);
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
    return id;
}
export async function updateLogDuration(logId, duration) {
    const logs = await getLogs();
    const log = logs.find(l => l.id === logId);
    if (log) {
        log.duration = duration;
        await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
    }
}
export async function clearLogs() {
    await addAuditLog({ event: 'stats_cleared' });
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
}
// Active sessions for time tracking
export async function getActiveSessions() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSIONS);
    return result[STORAGE_KEYS.ACTIVE_SESSIONS] ?? [];
}
export async function addActiveSession(session) {
    const sessions = await getActiveSessions();
    sessions.push(session);
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
}
export async function removeActiveSession(tabId) {
    const sessions = await getActiveSessions();
    const index = sessions.findIndex(s => s.tabId === tabId);
    if (index === -1)
        return null;
    const [removed] = sessions.splice(index, 1);
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
    return removed;
}
export async function getActiveSessionByTab(tabId) {
    const sessions = await getActiveSessions();
    return sessions.find(s => s.tabId === tabId) ?? null;
}
// Audit logs (immutable)
export async function getAuditLogs() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUDIT_LOGS);
    return result[STORAGE_KEYS.AUDIT_LOGS] ?? [];
}
export async function addAuditLog(log) {
    const logs = await getAuditLogs();
    const newLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
    };
    logs.unshift(newLog);
    await chrome.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: logs });
}
export async function initializeStorage() {
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
