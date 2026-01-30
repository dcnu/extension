import { getLogs, clearLogs, getAuditLogs } from '../lib/storage.js';
import type { NavigationLog, AuditLog } from '../lib/types.js';

const totalEl = document.getElementById('total') as HTMLSpanElement;
const blockedEl = document.getElementById('blocked') as HTMLSpanElement;
const proceededEl = document.getElementById('proceeded') as HTMLSpanElement;
const logsBody = document.getElementById('logs') as HTMLTableSectionElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;
const timeStatsBody = document.getElementById('time-stats') as HTMLTableSectionElement;
const timeEmptyState = document.getElementById('time-empty-state') as HTMLParagraphElement;
const auditLogsBody = document.getElementById('audit-logs') as HTMLTableSectionElement;
const auditEmptyState = document.getElementById('audit-empty-state') as HTMLParagraphElement;
const clearButton = document.getElementById('clear') as HTMLButtonElement;

function formatTimestamp(ts: number): string {
	const date = new Date(ts);
	return date.toLocaleString();
}

function formatDuration(ms: number | undefined): string {
	if (ms === undefined) return '—';
	if (ms < 1000) return '<1s';
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return `${hours}h ${remainingMinutes}m`;
}

interface DomainStats {
	totalTime: number;
	visits: number;
}

function calculateTimeStats(logs: NavigationLog[]): Map<string, DomainStats> {
	const stats = new Map<string, DomainStats>();
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

function renderTimeStats(logs: NavigationLog[]): void {
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

function renderLogs(logs: NavigationLog[]): void {
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

function renderAuditLogs(logs: AuditLog[]): void {
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

async function loadData(): Promise<void> {
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
