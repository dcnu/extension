const RULE_ID_BASE = 1000;

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRegexFilter(domain: string): string {
	const escaped = escapeRegex(domain);
	return `^https?://(.*\\.)?${escaped}/`;
}

export async function updateGreylistRules(domains: string[]): Promise<void> {
	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	const existingIds = existingRules.map(rule => rule.id);

	const warningPageUrl = chrome.runtime.getURL('src/pages/warning.html');

	const newRules: chrome.declarativeNetRequest.Rule[] = domains.map((domain, index) => ({
		id: RULE_ID_BASE + index,
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
		removeRuleIds: existingIds,
		addRules: newRules,
	});
}

export async function temporarilyAllowDomain(domain: string): Promise<void> {
	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	const domainRegex = createRegexFilter(domain);

	const matchingRule = existingRules.find(rule =>
		rule.condition.regexFilter === domainRegex
	);

	if (matchingRule) {
		await chrome.declarativeNetRequest.updateDynamicRules({
			removeRuleIds: [matchingRule.id],
		});

		setTimeout(async () => {
			const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
			const stillRemoved = !currentRules.find(r => r.id === matchingRule.id);

			if (stillRemoved) {
				await chrome.declarativeNetRequest.updateDynamicRules({
					addRules: [matchingRule],
				});
			}
		}, 5000);
	}
}

export async function getRuleCount(): Promise<number> {
	const rules = await chrome.declarativeNetRequest.getDynamicRules();
	return rules.length;
}
