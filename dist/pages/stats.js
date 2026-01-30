import { getLogs, clearLogs, getAuditLogs } from '../lib/storage.js';
const totalEl = document.getElementById('total');
const blockedEl = document.getElementById('blocked');
const proceededEl = document.getElementById('proceeded');
const logsBody = document.getElementById('logs');
const emptyState = document.getElementById('empty-state');
const timeStatsBody = document.getElementById('time-stats');
const timeEmptyState = document.getElementById('time-empty-state');
const auditLogsBody = document.getElementById('audit-logs');
const auditEmptyState = document.getElementById('audit-empty-state');
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
function calculateTimeStats(logs) {
    const stats = new Map();
    for (const log of logs) {
        if (log.action === 'proceeded' && log.duration !== undefined) {
            const existing = stats.get(log.domain) ?? { totalTime: 0, visits: 0 };
            existing.totalTime += log.duration;
            existing.visits += 1;
            stats.set(log.domain, existing);
        }
    }
    return stats;
}
function renderTimeStats(logs) {
    const stats = calculateTimeStats(logs);
    if (stats.size === 0) {
        timeStatsBody.innerHTML = '';
        timeEmptyState.hidden = false;
        return;
    }
    timeEmptyState.hidden = true;
    const sorted = [...stats.entries()].sort((a, b) => b[1].totalTime - a[1].totalTime);
    timeStatsBody.innerHTML = sorted.map(([domain, data]) => `
		<tr>
			<td>${domain}</td>
			<td>${formatDuration(data.totalTime)}</td>
			<td>${data.visits}</td>
			<td>${formatDuration(Math.round(data.totalTime / data.visits))}</td>
		</tr>
	`).join('');
}
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
    logsBody.innerHTML = logs.map(log => `
		<tr>
			<td>${formatTimestamp(log.timestamp)}</td>
			<td title="${log.fullUrl}">${log.domain}</td>
			<td class="action-${log.action}">${log.action}</td>
			<td>${formatDuration(log.duration)}</td>
		</tr>
	`).join('');
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
    const [logs, auditLogs] = await Promise.all([getLogs(), getAuditLogs()]);
    renderLogs(logs);
    renderTimeStats(logs);
    renderAuditLogs(auditLogs);
}
clearButton.addEventListener('click', async () => {
    if (confirm('Clear all navigation logs?')) {
        await clearLogs();
        await loadData();
    }
});
loadData();
