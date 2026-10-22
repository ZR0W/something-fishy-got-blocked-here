# Something Fishy

A small personal **Firefox** extension (Manifest V3). When a page won't load **because my DNS (Pi-hole) blocked it**, it replaces Firefox's "Hmm. We're having trouble finding that site." page with a message I wrote ("encouraging discouragement"). Messages can differ per site and by time of day, and it keeps a local count of how often I've tried.

**Maintainers & AI assistants:** see [AGENTS.md](AGENTS.md) for architecture, storage schema, design decisions, diagnostic findings, constraints, and the roadmap.

## What this is (and isn't)

- A **message layer, not the lock.** Pi-hole does the blocking; this only changes what the failure looks like. There's no "continue anyway" button.
- Only top-level pages. Blocked ads/trackers inside normal pages keep failing silently.
- Stays out of the way when DNS itself isn't working (offline, Pi-hole down) and for sites that are merely down — those keep Firefox's normal error page.
- No network requests of its own beyond two DNS lookups through Firefox's normal resolver (the failed host, and `example.com` as a "does DNS work at all?" check). No analytics, no remote code. Settings and counts stay in this browser (`storage.local`).
- Permissions: `dns`, `webNavigation`, `tabs`, `storage`. No access to page contents.

## How it decides something was blocked

On the network, Pi-hole answers a blocked name with `0.0.0.0` / `::`, and a non-existent name with "no such domain". **Firefox on Windows can't tell those apart:** Windows drops the `0.0.0.0` answer, and Firefox reports both as "unknown host" (details in AGENTS.md "How it decides").

So the rule is: **a top-level page fails with "unknown host" while DNS otherwise works → treat it as blocked.** In practice that's almost always a block; the occasional typo will get the message too (the page says so and shows the hostname).

DNS also carries **no reason code**, so the extension can't tell a Pi-hole blocklist block from a Cloudflare for Families block, or which rule matched. Per-site messages are matched on the URL instead.

## Limitations

- **Firefox only** (`browser.dns` doesn't exist in Chrome/Edge).
- **DNS over HTTPS must be off** (Settings → Privacy & Security → DNS over HTTPS → Off). With DoH on, Firefox bypasses Pi-hole: blocked sites just load. The settings page shows a warning if the extension notices DoH.
- **Typos** of real-looking names show the message instead of Firefox's error.
- Firefox and Windows cache DNS. After changing Pi-hole lists: `about:networking#dns` → **Clear DNS Cache**, and/or `ipconfig /flushdns`.

## Customizing messages

In `about:addons`, open Something Fishy's **⋯** menu → **Options**, or click **Edit messages** on the message page.

- **Default** title and messages, used when no rule matches.
- **Per-site rules**, top to bottom, first match wins. Site patterns:
  - `reddit.com` — the domain and all subdomains (`www.reddit.com`, `old.reddit.com`)
  - `=reddit.com` — exactly that host
  - `*.reddit.com` — subdomains only
  - optional **path** prefix, e.g. `/r/news`
- **Time of day:** give a message a start and end time (e.g. 23:00 → 05:00, wrapping past midnight). The first message whose window fits now is used; messages without times always fit. If none in a rule fits, the default messages are used.
- **Placeholders:** `{host}`, `{url}`, `{count}` (attempts at this host), `{time}`.
- **Attempt counts** are listed on the same page, with per-site and global reset. Toggle the "Attempt #N" line with **Show the attempt count**.
- **Preview** buttons open the message page with the *saved* settings. **Restore defaults** brings back the shipped placeholder wording.

## Development setup (Windows / PowerShell)

Needs Node ≥ 20 (`node -v`).

```powershell
git clone https://github.com/ZR0W/something-fishy-got-blocked-here.git
cd something-fishy-got-blocked-here
npm install        # installs web-ext locally (dev only)
npm test           # unit tests, no browser needed
npm run lint       # web-ext lint
npm start          # throwaway Firefox profile with the extension loaded (DoH forced off)
```

Or load it into your normal profile: **about:debugging#/runtime/this-firefox** → **Load Temporary Add-on…** → select `manifest.json`. Temporary add-ons disappear when Firefox closes; reload after code changes.

Test from the PC, never from the server (the server's own DNS doesn't go through Pi-hole).

## Testing (manual)

| Visit | Expected |
|---|---|
| `https://example.com/` | Loads normally |
| `https://ad.doubleclick.net/` | Message page (rule: "Just an ad server") |
| a known adult site (Cloudflare for Families block) | Message page (default message for the time of day) |
| `https://thisdomaindoesnotexist-12345.com/` | Message page too — known, accepted limitation |
| a normal page with ads (e.g. a news site) | Loads normally, no redirect |
| any blocked site with the network cable unplugged | Firefox's normal error page |
| **Go back** on the message page | Previous page (not the message again) |
| **Close tab** | Closes the tab |
| visit the same blocked site again | Attempt number goes up; settings page shows it |

## Install permanently (signing)

Firefox release only runs signed extensions. This one is signed as a **self-distributed (unlisted)** add-on: Mozilla signs it, but it isn't listed or published on addons.mozilla.org.

1. Sign in at [addons.mozilla.org](https://addons.mozilla.org/) and open **Developer Hub → Manage API Keys** (<https://addons.mozilla.org/developers/addon/api/key/>). Generate credentials: a **JWT issuer** (key) and **JWT secret**.
2. Put them in a git-ignored script (never commit them):

   ```powershell
   Copy-Item scripts\sign.local.example.ps1 sign.local.ps1
   notepad sign.local.ps1     # paste the issuer and secret
   ```

3. Bump `version` in `manifest.json` if this version was signed before (each version can be signed once), then:

   ```powershell
   .\sign.local.ps1
   ```

   If PowerShell refuses to run scripts: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
4. The signed `.xpi` lands in `web-ext-artifacts\`. Install it: `about:addons` → ⚙ → **Install Add-on From File…**. Remove the temporary copy from `about:debugging` first.

`web-ext` reads `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` from the environment, so setting them in a session and running `npm run sign` works too — but typed commands end up in PowerShell's history file, which is why the git-ignored script is the recommended way.

## Icons

PNG icons live under `icons/`. Regenerate with:

```powershell
py scripts\generate-icons.py
```

(`python3 scripts/generate-icons.py` on Linux.)

## License

Add a `LICENSE` file when you decide how you want to distribute the project.
