import { getCleanOnClose, getDomainAliases, addAuditLog } from './storage.js';
import { getRootDomain, expandDomainsWithAliases } from './domain.js';
/**
 * Returns both http and https origins for a domain,
 * as required by chrome.browsingData.remove({ origins }).
 */
function domainToOrigins(domain) {
    return [`https://${domain}`, `http://${domain}`];
}
/**
 * Removes cookies, cache, localStorage, indexedDB,
 * service workers, and cacheStorage for a single domain.
 */
async function cleanDomainData(domain) {
    const origins = domainToOrigins(domain);
    await chrome.browsingData.remove({ origins }, {
        cookies: true,
        cache: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true,
        cacheStorage: true,
    });
}
/**
 * Checks whether a hostname matches any domain in the
 * clean-on-close list (with alias expansion and subdomain matching).
 * Returns the matched root domain or null.
 */
export async function isCleanOnCloseDomain(hostname) {
    const config = await getCleanOnClose();
    if (config.domains.length === 0)
        return null;
    const aliases = await getDomainAliases();
    const expanded = expandDomainsWithAliases(config.domains, aliases);
    const root = getRootDomain(hostname, aliases);
    for (const domain of expanded) {
        if (hostname === domain || hostname.endsWith('.' + domain) || root === domain) {
            return domain;
        }
    }
    return null;
}
/**
 * Expands aliases for the domain, cleans browsing data for
 * each expanded origin, and writes an audit log entry.
 */
export async function cleanAndLog(domain) {
    const aliases = await getDomainAliases();
    const expanded = expandDomainsWithAliases([domain], aliases);
    for (const d of expanded) {
        await cleanDomainData(d);
    }
    await addAuditLog({
        event: 'clean_on_close',
        details: `Cleaned: ${expanded.join(', ')}`,
    });
}
