const STORAGE_KEYS = {
    GREYLIST: 'greylist',
    LOGS: 'logs',
    ACTIVE_SESSIONS: 'activeSessions',
    AUDIT_LOGS: 'auditLogs',
    DOMAIN_ALIASES: 'domainAliases',
};
const DEFAULT_ALIASES = [
    { from: 'twitter.com', to: 'x.com' },
];
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
export async function updateLogAction(logId, action) {
    const logs = await getLogs();
    const log = logs.find(l => l.id === logId);
    if (log) {
        log.action = action;
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
export async function getSessionCountForDomain(domain) {
    const sessions = await getActiveSessions();
    return sessions.filter(s => s.domain === domain).length;
}
export async function setSessionActive(tabId, isActive) {
    const sessions = await getActiveSessions();
    const session = sessions.find(s => s.tabId === tabId);
    if (session) {
        if (isActive) {
            session.lastActiveTime = Date.now();
        }
        else if (session.lastActiveTime) {
            session.accumulatedTime += Date.now() - session.lastActiveTime;
            session.lastActiveTime = null;
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: sessions });
    }
}
// Audit logs (immutable)
export async function getAuditLogs() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUDIT_LOGS);
    return result[STORAGE_KEYS.AUDIT_LOGS] ?? [];
}
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export async function addAuditLog(log) {
    const logs = await getAuditLogs();
    const now = Date.now();
    const newLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: now,
    };
    logs.unshift(newLog);
    // Prune entries older than 7 days
    const pruned = logs.filter(l => now - l.timestamp < SEVEN_DAYS_MS);
    await chrome.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: pruned });
}
// Domain aliases
export async function getDomainAliases() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.DOMAIN_ALIASES);
    return result[STORAGE_KEYS.DOMAIN_ALIASES] ?? DEFAULT_ALIASES;
}
export async function setDomainAliases(aliases) {
    await chrome.storage.local.set({ [STORAGE_KEYS.DOMAIN_ALIASES]: aliases });
}
export async function initializeStorage() {
    const result = await chrome.storage.local.get([
        STORAGE_KEYS.GREYLIST,
        STORAGE_KEYS.LOGS,
        STORAGE_KEYS.ACTIVE_SESSIONS,
        STORAGE_KEYS.AUDIT_LOGS,
        STORAGE_KEYS.DOMAIN_ALIASES,
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
    if (!result[STORAGE_KEYS.DOMAIN_ALIASES]) {
        await setDomainAliases(DEFAULT_ALIASES);
    }
}
