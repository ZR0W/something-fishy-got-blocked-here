// Background (Firefox MV3 event page). Watches top-level navigation failures;
// when one looks like a DNS block, swaps Firefox's error page for blocked.html.
// Decision logic lives in src/common/decide.js; see AGENTS.md for why it works
// this way (Windows/Firefox report a DNS block exactly like an unknown host).
"use strict";

// A name that must always resolve through Pi-hole. If it doesn't, DNS itself is
// broken (offline, Pi-hole down) and we stay out of the way.
const CANARY_HOST = "example.com";
const BLOCKED_PAGE = "src/blocked/blocked.html";

const inFlight = new Set();
let writeChain = Promise.resolve();

function debug(...args) {
  try {
    if (localStorage.getItem("sf_debug") === "1") console.log("[something-fishy]", ...args);
  } catch {
    // no localStorage — no debug output
  }
}

async function lookup(host, flags = []) {
  try {
    const rec = await browser.dns.resolve(host, flags);
    return { addresses: rec.addresses, isTRR: rec.isTRR };
  } catch (err) {
    return { rejected: String(err?.message ?? err) };
  }
}

// Serialized read-modify-write so two blocks at once don't lose a count.
function updateStorage(key, fn) {
  writeChain = writeChain
    .then(async () => {
      const { [key]: current } = await browser.storage.local.get(key);
      await browser.storage.local.set({ [key]: fn(current) });
    })
    .catch((err) => console.error("[something-fishy] storage write failed", err));
  return writeChain;
}

async function handleError(details) {
  if (!SF_DECIDE.shouldInvestigate(details)) return;
  const host = SF_URL.candidateHost(details.url);
  if (!host) return;

  const key = `${details.tabId}|${details.url}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const [hostResult, canary] = await Promise.all([
      lookup(host),
      lookup(CANARY_HOST, ["bypass_cache"]),
    ]);
    if (hostResult.isTRR || canary.isTRR) {
      // DoH is on again: Firefox is bypassing Pi-hole. Options page warns.
      updateStorage(SF_CONFIG.DOH_SEEN_KEY, () => new Date().toISOString());
    }
    const verdict = SF_DECIDE.decide({ host: hostResult, canary, online: navigator.onLine });
    debug(details.url, details.error, hostResult, canary, verdict);
    if (!verdict.redirect) return;

    // The user may have navigated elsewhere while we were looking things up.
    const tab = await browser.tabs.get(details.tabId);
    if (tab.url !== details.url) return;

    await updateStorage(SF_CONFIG.ATTEMPTS_KEY, (map) =>
      SF_ATTEMPTS.recordAttempt(map, host, new Date().toISOString())
    );
    const target = browser.runtime.getURL(BLOCKED_PAGE) + "?url=" + encodeURIComponent(details.url);
    // loadReplace: the message page replaces the failed history entry, so Back
    // goes to the previous page instead of re-triggering the redirect.
    await browser.tabs.update(details.tabId, { url: target, loadReplace: true });
  } catch (err) {
    console.error("[something-fishy] handling failed navigation", err);
  } finally {
    inFlight.delete(key);
  }
}

// Firefox throws on an empty filter; http(s) is all we care about anyway.
browser.webNavigation.onErrorOccurred.addListener(handleError, {
  url: [{ schemes: ["http", "https"] }],
});
