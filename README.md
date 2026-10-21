# Something Fishy

A small personal **Firefox** extension (Manifest V3). When a page won't load **because my DNS (Pi-hole) blocked it**, it replaces Firefox's generic "Hmm. We're having trouble finding that site." page with a message I wrote ("encouraging discouragement"), optionally different per site and per time of day, plus a local count of how often I've tried.

> **Status: in progress.** The decision logic and its tests are in place; the message page, options page and signing aren't built yet. See [AGENTS.md](AGENTS.md) "Status".

**Maintainers & AI assistants:** see [AGENTS.md](AGENTS.md) for architecture, storage schema, design decisions, constraints, and the roadmap.

## What this is (and isn't)

- A **message layer, not the lock.** Pi-hole does the blocking. This only changes what the failure looks like.
- No "continue anyway" button, and nothing that weakens the block.
- It stays out of the way for ordinary failures: typos, sites that are down, being offline. Those still show Firefox's normal error page.
- No network requests of its own beyond asking Firefox's normal DNS resolver about the host that just failed. No analytics, no remote code. Settings and counts stay in `storage.local`.

## How it decides something was blocked

When a top-level page fails to load, the extension asks Firefox's DNS resolver (`browser.dns.resolve`) about that hostname:

- **every address is `0.0.0.0` or `::`** → blocked by my DNS → show my message;
- **no such domain** (typo), **real addresses** (site down), or **no answer** (offline) → do nothing.

DNS has no "reason" field, so the extension **can't tell** a Pi-hole blocklist block from a Cloudflare for Families block (both come back as `0.0.0.0` / `::`), or which rule matched. Per-site messages are matched on the URL instead.

## Limitations

- **Firefox only.** `browser.dns` doesn't exist in Chrome/Edge.
- **DNS over HTTPS must be off** in Firefox (Settings → Privacy & Security → DNS over HTTPS → Off). With DoH on, Firefox bypasses Pi-hole: blocked sites just load and the extension never triggers.
- **Pi-hole must use its default blocking mode** (null addresses). In NXDOMAIN mode, blocks look exactly like typos.
- Only top-level pages. Blocked ads/trackers inside a normal page fail silently as before.
- Firefox caches DNS answers. After changing Pi-hole lists, use `about:networking#dns` → **Clear DNS Cache** if a site still behaves the old way.

## Development setup (Windows / PowerShell)

Needs Node ≥ 20 (`node -v`).

```powershell
git clone https://github.com/ZR0W/something-fishy-got-blocked-here.git
cd something-fishy-got-blocked-here
npm install        # installs web-ext locally (dev only)
npm test           # unit tests, no browser needed
```

Test from the PC, never from the server (the server's own DNS doesn't go through Pi-hole).

## Icons

PNG icons live under `icons/`. Regenerate with:

```powershell
py scripts\generate-icons.py
```

(`python3 scripts/generate-icons.py` on Linux.)

## License

Add a `LICENSE` file when you decide how you want to distribute the project.
