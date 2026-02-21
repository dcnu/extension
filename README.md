# 🐻 extension

Personal Chrome extension with productivity and browsing utilities.

## Features

### Domain Greylist
Intercept navigation to configured domains with a warning page.
- Block (close tab) or proceed anyway
- Per-tab authorization with session tracking
- Tracks time spent on proceeded sites

### Clean on Close
Automatically delete cookies, cache, and site data when the last tab for a configured domain closes.
- Alias-aware: if `twitter.com` is aliased to `x.com`, both are cleaned
- Subdomain matching: `reddit.com` covers `old.reddit.com`, `www.reddit.com`, etc.
- Startup cleanup: data is also cleaned on browser launch to cover quit-with-tabs-open

### URL Cleaner
Copy current URL with tracking parameters stripped.
- `Cmd+Shift+L` (Mac) / `Ctrl+Shift+L` (Windows/Linux)

## Installation

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`, enable Developer mode
3. Load unpacked → select extension directory

## Development

```bash
pnpm build    # Compile TypeScript
pnpm lint     # Run ESLint
```
