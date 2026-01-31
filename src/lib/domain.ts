// Known multi-level TLDs where the registrable domain includes an extra segment
const MULTI_LEVEL_TLDS = new Set([
	'co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in',
	'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'org.au', 'edu.au',
]);

/**
 * Extracts the root/registrable domain from a hostname.
 * Examples:
 *   www.reddit.com → reddit.com
 *   old.reddit.com → reddit.com
 *   bbc.co.uk → bbc.co.uk
 *   www.bbc.co.uk → bbc.co.uk
 */
export function getRootDomain(hostname: string): string {
	const parts = hostname.split('.');
	if (parts.length <= 2) return hostname;

	// Check for multi-level TLD
	const lastTwo = parts.slice(-2).join('.');
	if (MULTI_LEVEL_TLDS.has(lastTwo)) {
		return parts.slice(-3).join('.');
	}

	return parts.slice(-2).join('.');
}
