import { getLogs, clearLogs, getAuditLogs, getDomainAliases } from '../lib/storage.js';
import { getRootDomain } from '../lib/domain.js';
import type { NavigationLog, AuditLog, DomainAlias } from '../lib/types.js';

const totalEl = document.getElementById('total') as HTMLSpanElement;
const blockedEl = document.getElementById('blocked') as HTMLSpanElement;
const proceededEl = document.getElementById('proceeded') as HTMLSpanElement;
const logsBody = document.getElementById('logs') as HTMLTableSectionElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;
const timeStatsBody = document.getElementById('time-stats') as HTMLTableSectionElement;
const timeEmptyState = document.getElementById('time-empty-state') as HTMLParagraphElement;
const auditLogsBody = document.getElementById('audit-logs') as HTMLTableSectionElement;
const auditEmptyState = document.getElementById('audit-empty-state') as HTMLParagraphElement;
const timeSavedEl = document.getElementById('time-saved') as HTMLSpanElement;
const timeSpentEl = document.getElementById('time-spent') as HTMLSpanElement;
const clearButton = document.getElementById('clear') as HTMLElement;

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
	blocked: number;
}

function calculateTimeStats(logs: NavigationLog[], aliases: DomainAlias[]): Map<string, DomainStats> {
	const stats = new Map<string, DomainStats>();
	for (const log of logs) {
		const normalizedDomain = getRootDomain(log.domain, aliases);
		const existing = stats.get(normalizedDomain) ?? { totalTime: 0, visits: 0, blocked: 0 };
		if (log.action === 'proceeded') {
			existing.visits += 1;
			if (log.duration !== undefined) {
				existing.totalTime += log.duration;
			}
		} else if (log.action === 'blocked') {
			existing.blocked += 1;
		}
		stats.set(normalizedDomain, existing);
	}
	return stats;
}

function renderTimeStats(logs: NavigationLog[], aliases: DomainAlias[]): void {
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
