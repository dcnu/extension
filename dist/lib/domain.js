// Known multi-level TLDs where the registrable domain includes an extra segment
const MULTI_LEVEL_TLDS = new Set([
    'co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in',
    'org.uk', 'net.au', 'ac.uk', 'gov.uk', 'org.au', 'edu.au',
]);
/**
 * Extracts the root/registrable domain from a hostname.
 * Optionally applies domain aliases for stats aggregation.
 * Examples:
 *   www.reddit.com → reddit.com
 *   old.reddit.com → reddit.com
 *   bbc.co.uk → bbc.co.uk
 *   www.bbc.co.uk → bbc.co.uk
 *   twitter.com → x.com (with aliases)
 */
export function getRootDomain(hostname, aliases) {
    const parts = hostname.split('.');
    let root;
    if (parts.length <= 2) {
        root = hostname;
    }
    else {
        const lastTwo = parts.slice(-2).join('.');
        root = MULTI_LEVEL_TLDS.has(lastTwo)
            ? parts.slice(-3).join('.')
            : parts.slice(-2).join('.');
    }
    if (aliases) {
        const alias = aliases.find(a => a.from === root);
        if (alias)
            return alias.to;
    }
    return root;
}
/**
 * Expands a list of domains to include all aliased counterparts.
 * If twitter.com is in the list and there's an alias twitter.com → x.com,
 * both twitter.com and x.com will be in the result.
 */
export function expandDomainsWithAliases(domains, aliases) {
    const expanded = new Set(domains);
    for (const domain of domains) {
        for (const alias of aliases) {
            if (alias.from === domain)
                expanded.add(alias.to);
            if (alias.to === domain)
                expanded.add(alias.from);
        }
    }
    return Array.from(expanded);
}
