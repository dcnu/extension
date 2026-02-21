import { expandDomainsWithAliases, getRootDomain } from './domain.js';
import { getDomainAliases } from './storage.js';

const REDIRECT_RULE_ID_BASE = 1000;
const ALLOW_RULE_ID_BASE = 10000;
const INITIATOR_RULE_ID_BASE = 20000;

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRegexFilter(domain: string): string {
	const escaped = escapeRegex(domain);
	return `^https?://(.*\\.)?${escaped}/`;
}

function hashCode(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash) + str.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function getAllowRuleId(tabId: number, domain: string): number {
	// Deterministic rule ID from tabId + domain hash
	return ALLOW_RULE_ID_BASE + (tabId % 1000) * 100 + hashCode(domain) % 100;
}

function getInitiatorRuleId(domain: string): number {
	return INITIATOR_RULE_ID_BASE + hashCode(domain) % 10000;
}

export async function authorizeTabForDomain(tabId: number, domain: string): Promise<void> {
	const aliases = await getDomainAliases();
	const domainsToAuthorize = expandDomainsWithAliases([domain], aliases);

	for (const d of domainsToAuthorize) {
		const ruleId = getAllowRuleId(tabId, d);
		const regexFilter = createRegexFilter(d);

		const rule: chrome.declarativeNetRequest.Rule = {
			id: ruleId,
			priority: 2, // Higher than redirect rules (priority 1)
			action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
			condition: {
				regexFilter,
				resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
				tabIds: [tabId],
			},
		};

		console.log('[rules] Creating allow rule:', { ruleId, tabId, domain: d, regexFilter });

		// Use session rules for tabIds support (dynamic rules don't support tabIds)
		try {
			await chrome.declarativeNetRequest.updateSessionRules({
				removeRuleIds: [ruleId],
				addRules: [rule],
			});
		} catch (error) {
			console.error('[rules] updateSessionRules failed:', error);
			throw error;
		}
	}
}

export async function revokeTabAuthorization(tabId: number, domain: string): Promise<void> {
	const aliases = await getDomainAliases();
	const domainsToRevoke = expandDomainsWithAliases([domain], aliases);
	const ruleIds = domainsToRevoke.map(d => getAllowRuleId(tabId, d));
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds: ruleIds,
	});
}

export async function revokeAllAuthorizationsForTab(tabId: number): Promise<void> {
	// Query session rules (allow rules with tabIds are session-scoped)
	const rules = await chrome.declarativeNetRequest.getSessionRules();
	const allowRuleIds = rules
		.filter(r => r.id >= ALLOW_RULE_ID_BASE && r.condition?.tabIds?.includes(tabId))
		.map(r => r.id);

	if (allowRuleIds.length > 0) {
		await chrome.declarativeNetRequest.updateSessionRules({
			removeRuleIds: allowRuleIds,
		});
	}
}

export async function updateGreylistRules(domains: string[]): Promise<void> {
	const aliases = await getDomainAliases();
	const expandedDomains = expandDomainsWithAliases(domains, aliases);

	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	// Remove existing redirect rules (allow rules are session-scoped, not dynamic)
	const redirectRuleIds = existingRules
		.filter(rule => rule.id < ALLOW_RULE_ID_BASE)
		.map(rule => rule.id);

	const warningPageUrl = chrome.runtime.getURL('src/pages/warning.html');

	const newRules: chrome.declarativeNetRequest.Rule[] = expandedDomains.map((domain, index) => ({
		id: REDIRECT_RULE_ID_BASE + index,
		priority: 1,
		action: {
			type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
			redirect: {
				regexSubstitution: `${warningPageUrl}?url=\\0`,
			},
		},
		condition: {
			regexFilter: createRegexFilter(domain),
			resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
		},
	}));

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: redirectRuleIds,
		addRules: newRules,
	});
}

export async function addInitiatorRule(domain: string): Promise<void> {
	const aliases = await getDomainAliases();
	// Use root domain so rule covers all subdomains (l., www., m., etc.)
	const rootDomain = getRootDomain(domain, aliases);
	const domainsToAuthorize = expandDomainsWithAliases([rootDomain], aliases);

	console.log('[rules] addInitiatorRule called:', { domain, rootDomain, domainsToAuthorize });

	for (const d of domainsToAuthorize) {
		const ruleId = getInitiatorRuleId(d);
		const regexFilter = createRegexFilter(d);

		const rule: chrome.declarativeNetRequest.Rule = {
			id: ruleId,
			priority: 2,
			action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
			condition: {
				regexFilter,
				resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
				initiatorDomains: [d],
			},
		};

		console.log('[rules] Creating initiator rule:', JSON.stringify(rule, null, 2));

		// Use dynamic rules (not session) so they persist across service worker restarts
		await chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: [ruleId],
			addRules: [rule],
		});
	}
}

export async function removeInitiatorRule(domain: string): Promise<void> {
	const aliases = await getDomainAliases();
	const rootDomain = getRootDomain(domain, aliases);
	const domainsToRevoke = expandDomainsWithAliases([rootDomain], aliases);
	const ruleIds = domainsToRevoke.map(d => getInitiatorRuleId(d));

	console.log('[rules] Removing initiator rules:', { domain, ruleIds });

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: ruleIds,
	});
}

export async function getRuleCount(): Promise<number> {
	const [dynamicRules, sessionRules] = await Promise.all([
		chrome.declarativeNetRequest.getDynamicRules(),
		chrome.declarativeNetRequest.getSessionRules(),
	]);
	return dynamicRules.length + sessionRules.length;
}

export async function debugRules(): Promise<void> {
	const [dynamicRules, sessionRules] = await Promise.all([
		chrome.declarativeNetRequest.getDynamicRules(),
		chrome.declarativeNetRequest.getSessionRules(),
	]);
	console.log('[rules] === DEBUG DUMP ===');
	console.log('[rules] Dynamic rules:', JSON.stringify(dynamicRules, null, 2));
	console.log('[rules] Session rules:', JSON.stringify(sessionRules, null, 2));
	console.log('[rules] === END DUMP ===');
}
