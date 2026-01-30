const REDIRECT_RULE_ID_BASE = 1000;
const ALLOW_RULE_ID_BASE = 10000;

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

export async function authorizeTabForDomain(tabId: number, domain: string): Promise<void> {
	const ruleId = getAllowRuleId(tabId, domain);
	const regexFilter = createRegexFilter(domain);

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

	console.log('[rules] Creating allow rule:', { ruleId, tabId, domain, regexFilter });

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

	// Verify rule was created
	const rules = await chrome.declarativeNetRequest.getSessionRules();
	const created = rules.find(r => r.id === ruleId);
	const allowRules = rules.filter(r => r.id >= ALLOW_RULE_ID_BASE);
	console.log('[rules] After creation:', {
		ruleId,
		created: !!created,
		totalRules: rules.length,
		allowRuleCount: allowRules.length,
		allowRuleIds: allowRules.map(r => r.id)
	});

	if (!created) {
		throw new Error(`Failed to create allow rule ${ruleId} for ${domain}`);
	}
}

export async function revokeTabAuthorization(tabId: number, domain: string): Promise<void> {
	const ruleId = getAllowRuleId(tabId, domain);
	await chrome.declarativeNetRequest.updateSessionRules({
		removeRuleIds: [ruleId],
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
	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	// Remove existing redirect rules (allow rules are session-scoped, not dynamic)
	const redirectRuleIds = existingRules
		.filter(rule => rule.id < ALLOW_RULE_ID_BASE)
		.map(rule => rule.id);

	const warningPageUrl = chrome.runtime.getURL('src/pages/warning.html');

	const newRules: chrome.declarativeNetRequest.Rule[] = domains.map((domain, index) => ({
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

export async function getRuleCount(): Promise<number> {
	const [dynamicRules, sessionRules] = await Promise.all([
		chrome.declarativeNetRequest.getDynamicRules(),
		chrome.declarativeNetRequest.getSessionRules(),
	]);
	return dynamicRules.length + sessionRules.length;
}
