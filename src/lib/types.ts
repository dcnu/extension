export interface GreylistConfig {
	domains: string[];
}

export interface NavigationLog {
	id: string;
	timestamp: number;
	domain: string;
	fullUrl: string;
	action: 'blocked' | 'proceeded';
	duration?: number; // milliseconds spent on site (only for 'proceeded')
}

export interface ActiveSession {
	logId: string;
	tabId: number;
	domain: string;
	startTime: number;
	accumulatedTime: number; // total active ms so far
	lastActiveTime: number | null; // timestamp when tab became active, null if inactive
}

export interface AuditLog {
	id: string;
	timestamp: number;
	event: 'stats_cleared';
	details?: string;
}

export interface DomainAlias {
	from: string;
	to: string;
}

export interface StorageData {
	greylist: GreylistConfig;
	logs: NavigationLog[];
	activeSessions: ActiveSession[];
	auditLogs: AuditLog[];
	domainAliases: DomainAlias[];
}

export type MessageType = 'ALLOW_ONCE' | 'RULES_UPDATED' | 'COPY_TEXT' | 'GET_ORIGINAL_URL';

export interface AllowOnceMessage {
	type: 'ALLOW_ONCE';
	domain: string;
	url: string;
	logId: string;
	tabId: number;
}

export interface RulesUpdatedMessage {
	type: 'RULES_UPDATED';
}

export interface CopyTextMessage {
	type: 'COPY_TEXT';
	text: string;
}

export interface GetOriginalUrlMessage {
	type: 'GET_ORIGINAL_URL';
	tabId: number;
}

export type ExtensionMessage = AllowOnceMessage | RulesUpdatedMessage | CopyTextMessage | GetOriginalUrlMessage;
