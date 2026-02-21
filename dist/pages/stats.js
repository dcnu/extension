import { getLogs, clearLogs, getAuditLogs, getDomainAliases } from '../lib/storage.js';
import { getRootDomain } from '../lib/domain.js';
const totalEl = document.getElementById('total');
const blockedEl = document.getElementById('blocked');
const proceededEl = document.getElementById('proceeded');
const logsBody = document.getElementById('logs');
const emptyState = document.getElementById('empty-state');
const timeStatsBody = document.getElementById('time-stats');
const timeEmptyState = document.getElementById('time-empty-state');
const auditLogsBody = document.getElementById('audit-logs');
const auditEmptyState = document.getElementById('audit-empty-state');
const timeSavedEl = document.getElementById('time-saved');
const timeSpentEl = document.getElementById('time-spent');
const clearButton = document.getElementById('clear');
function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleString();
}
function formatDuration(ms) {
    if (ms === undefined)
        return '—';
    if (ms < 1000)
        return '<1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60)
        return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
function calculateTimeStats(logs, aliases) {
    const stats = new Map();
    for (const log of logs) {
        const normalizedDomain = getRootDomain(log.domain, aliases);
        const existing = stats.get(normalizedDomain) ?? { totalTime: 0, visits: 0, blocked: 0 };
        if (log.action === 'proceeded') {
            existing.visits += 1;
            if (log.duration !== undefined) {
                existing.totalTime += log.duration;
            }
        }
        else if (log.action === 'blocked') {
            existing.blocked += 1;
        }
        stats.set(normalizedDomain, existing);
    }
    return stats;
}
function renderTimeStats(logs, aliases) {
    const stats = calculateTimeStats(logs, aliases);
    if (stats.size === 0) {
        timeStatsBody.innerHTML = '';
        timeEmptyState.hidden = false;
        return;
    }
    timeEmptyState.hidden = true;
    const sorted = [...stats.entries()].sort((a, b) => b[1].totalTime - a[1].totalTime);
    let totalTimeSaved = 0;
    let totalTimeSpent = 0;
    timeStatsBody.innerHTML = sorted.map(([domain, data]) => {
        const totalAttempts = data.visits + data.blocked;
        const percentBlocked = totalAttempts > 0 ? Math.round(data.blocked / totalAttempts * 100) : 0;
        const avgVisit = data.visits > 0 ? data.totalTime / data.visits : 0;
        totalTimeSaved += avgVisit * data.blocked;
        totalTimeSpent += data.totalTime;
        return `
		<tr>
			<td>${domain}</td>
			<td>${formatDuration(data.totalTime)}</td>
			<td>${data.visits}</td>
			<td>${formatDuration(data.visits > 0 ? Math.round(avgVisit) : 0)}</td>
			<td>${percentBlocked}%</td>
		</tr>
	`;
    }).join('');
    timeSavedEl.textContent = formatDuration(Math.round(totalTimeSaved));
    timeSpentEl.textContent = formatDuration(Math.round(totalTimeSpent));
}
const LOG_DISPLAY_LIMIT = 200;
function renderLogs(logs) {
    const blocked = logs.filter(l => l.action === 'blocked').length;
    const proceeded = logs.filter(l => l.action === 'proceeded').length;
    totalEl.textContent = logs.length.toString();
    blockedEl.textContent = blocked.toString();
    proceededEl.textContent = proceeded.toString();
    if (logs.length === 0) {
        logsBody.innerHTML = '';
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;
    const visible = logs.slice(0, LOG_DISPLAY_LIMIT);
    logsBody.innerHTML = visible.map(log => `
		<tr>
			<td>${formatTimestamp(log.timestamp)}</td>
			<td title="${log.fullUrl}">${log.domain}</td>
			<td class="action-${log.action}">${log.action}</td>
			<td>${formatDuration(log.duration)}</td>
		</tr>
	`).join('');
    const truncated = logs.length - visible.length;
    const existingNotice = document.getElementById('logs-truncation-notice');
    if (truncated > 0) {
        const notice = existingNotice ?? document.createElement('p');
        notice.id = 'logs-truncation-notice';
        notice.className = 'empty-state';
        notice.textContent = `Showing ${visible.length} of ${logs.length} entries`;
        if (!existingNotice)
            logsBody.parentElement.insertAdjacentElement('afterend', notice);
    }
    else if (existingNotice) {
        existingNotice.remove();
    }
}
function renderAuditLogs(logs) {
    if (logs.length === 0) {
        auditLogsBody.innerHTML = '';
        auditEmptyState.hidden = false;
        return;
    }
    auditEmptyState.hidden = true;
    auditLogsBody.innerHTML = logs.map(log => `
		<tr>
			<td>${formatTimestamp(log.timestamp)}</td>
			<td>${log.event.replace('_', ' ')}</td>
		</tr>
	`).join('');
}
async function loadData() {
    const [logs, auditLogs, aliases] = await Promise.all([getLogs(), getAuditLogs(), getDomainAliases()]);
    renderLogs(logs);
    renderTimeStats(logs, aliases);
    renderAuditLogs(auditLogs);
}
clearButton.addEventListener('click', async () => {
    if (confirm('Clear all navigation logs?')) {
        await clearLogs();
        await loadData();
    }
});
loadData();
