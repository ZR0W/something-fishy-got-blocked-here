# Diagnostic extension (temporary, not shipped)

A logging-only Firefox extension used once to verify how Firefox actually behaves when a page fails to load because Pi-hole answered `0.0.0.0` / `::`. It **never redirects** anything. It has broader permissions than the real extension (`webRequest` + access to all sites), so it's only for a test session: load it temporarily, run the tests, copy the log, remove it.

It records, for every failed `http`/`https` load:

- the `webNavigation.onErrorOccurred` event (frame id, URL, which fields Firefox fills in);
- the `webRequest.onErrorOccurred` error string (e.g. `NS_ERROR_…`) for pages and frames;
- for top-level failures: the `dns.resolve()` answer, cached and cache-bypassed (addresses, CNAME, `isTRR`), and the tab's URL while the error page is up.

The log stays in this extension's `storage.local` until you click **Clear** or remove the extension. Click the toolbar button (generic puzzle-piece icon) to view it.

Run from the repo root:

```powershell
npm run diag
```
