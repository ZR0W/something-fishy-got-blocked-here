// Background (Firefox MV3 event page). Watches top-level navigation failures;
// when one looks like a DNS block, swaps Firefox's error page for what the
// matching entry says to show (message page, your page, blank page, or close).
// Decision logic lives in src/common/decide.js; see AGENTS.md for why it works
// this way (Windows/Firefox report a DNS block exactly like an unknown host).
"use strict";

// A name that must always resolve through Pi-hole. If it doesn't, DNS itself is
// broken (offline, Pi-hole down) and we stay out of the way.
const CANARY_HOST = "example.com";
const BLOCKED_PAGE = "src/blocked/blocked.html";
const BLANK_PAGE = "src/blank/blank.html";
// If the custom page we just sent a tab to fails the same way (its host is
// blocked too), fall back to the message page instead of looping.
const LOOP_GUARD_MS = 5000;

const LOG_MAX = 50;

const inFlight = new Set();
// tabId → { url, timeStamp } of the latest top-level navigation start. Lets us
// tell whether the user moved on while we were looking things up, without
// depending on when Firefox updates tab.url for the error page. Lost if the
// event page unloads; then we just don't know, and proceed.
const lastNavStart = new Map();
// tabId → { at, host, blockedUrl } for the last time we sent a tab to a custom page.
const lastPageRedirect = new Map();
let writeChain = Promise.resolve();

// Records why a failed navigation was or wasn't redirected — to the console
// always at debug level, and to storage when the options-page troubleshooting
// log is switched on.
async function record(entry) {
  console.debug("[something-fishy]", entry);
  const { [SF_CONFIG.DEBUG_KEY]: on } = await browser.storage.local.get(SF_CONFIG.DEBUG_KEY);
  if (!on) return;
  updateStorage(SF_CONFIG.LOG_KEY, (list) =>
    [...(Array.isArray(list) ? list : []), { at: new Date().toISOString(), ...entry }].slice(-LOG_MAX)
  );
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
  if (details.frameId !== 0) return; // subframes: never act, not even log
  const base = { url: details.url, error: details.error };
  if (!SF_DECIDE.shouldInvestigate(details)) return record({ ...base, outcome: "skip: not unknown-host" });
  const host = SF_URL.candidateHost(details.url);
  if (!host) return record({ ...base, outcome: "skip: ignored URL" });

  const key = `${details.tabId}|${details.url}`;
  if (inFlight.has(key)) return record({ ...base, outcome: "skip: already handling" });
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
    const facts = { ...base, host: hostResult, canary, online: navigator.onLine, reason: verdict.reason };
    if (!verdict.redirect) return record({ ...facts, outcome: "skip: decided not blocked" });

    // The user may have started another navigation in this tab meanwhile.
    const latest = lastNavStart.get(details.tabId);
    if (latest && latest.timeStamp > details.timeStamp && latest.url !== details.url) {
      return record({ ...facts, outcome: `skip: tab moved on to ${latest.url}` });
    }

    // A custom page we redirected to just failed as well → message page for the
    // original URL, and don't count it twice.
    const guard = lastPageRedirect.get(details.tabId);
    if (guard && guard.host === host && Date.now() - guard.at < LOOP_GUARD_MS) {
      lastPageRedirect.delete(details.tabId);
      await showMessagePage(details.tabId, guard.blockedUrl, null);
      return record({ ...facts, outcome: "shown: message page (custom page failed too)" });
    }

    let count = 0;
    await updateStorage(SF_CONFIG.ATTEMPTS_KEY, (map) => {
      const next = SF_ATTEMPTS.recordAttempt(map, host, new Date().toISOString());
      count = next[host].count;
      return next;
    });

    const { [SF_CONFIG.CONFIG_KEY]: stored } = await browser.storage.local.get(SF_CONFIG.CONFIG_KEY);
    const config = SF_CONFIG.normalizeConfig(stored);
    const now = new Date();
    const picked = SF_RULES.pickEntry(config, details.url, now);
    const show = picked.entry?.show ?? "message";
    const outcome = await showEntry(details.tabId, details.url, picked, {
      url: details.url,
      host,
      count,
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    });
    record({ ...facts, show, outcome });
  } catch (err) {
    console.error("[something-fishy] handling failed navigation", err);
    record({ ...base, outcome: `error: ${err?.message ?? err}` });
  } finally {
    inFlight.delete(key);
  }
}

// loadReplace: the shown page replaces the failed history entry, so Back goes
// to the previous page instead of re-triggering the redirect.
function replaceTab(tabId, url) {
  return browser.tabs.update(tabId, { url, loadReplace: true });
}

// `picked` (from SF_RULES.pickEntry) tells the message page which entry to show;
// null lets it pick a message itself.
function showMessagePage(tabId, blockedUrl, picked) {
  let url = browser.runtime.getURL(BLOCKED_PAGE) + "?url=" + encodeURIComponent(blockedUrl);
  if (picked && picked.entryIndex >= 0) url += `&r=${picked.ruleIndex}&e=${picked.entryIndex}`;
  return replaceTab(tabId, url);
}

async function showEntry(tabId, blockedUrl, picked, vars) {
  const show = picked.entry?.show ?? "message";
  if (show === "close") {
    await browser.tabs.remove(tabId);
    return "closed tab";
  }
  if (show === "blank") {
    await replaceTab(tabId, browser.runtime.getURL(BLANK_PAGE) + "?url=" + encodeURIComponent(blockedUrl));
    return "shown: blank page";
  }
  if (show === "page") {
    const target = SF_RULES.renderUrl(picked.entry.url, vars);
    if (target) {
      lastPageRedirect.set(tabId, { at: Date.now(), host: new URL(target).hostname, blockedUrl });
      await replaceTab(tabId, target);
      return `shown: ${target}`;
    }
    // Unreachable for saved configs (validated), but never leave the tab stuck.
  }
  await showMessagePage(tabId, blockedUrl, show === "message" ? picked : null);
  return "shown: message page";
}

// Firefox throws on an empty filter; http(s) is all we care about for errors.
browser.webNavigation.onErrorOccurred.addListener(handleError, {
  url: [{ schemes: ["http", "https"] }],
});

browser.webNavigation.onBeforeNavigate.addListener(
  (d) => {
    if (d.frameId === 0) lastNavStart.set(d.tabId, { url: d.url, timeStamp: d.timeStamp });
  },
  { url: [{ urlMatches: ".*" }] }
);

browser.tabs.onRemoved.addListener((tabId) => {
  lastNavStart.delete(tabId);
  lastPageRedirect.delete(tabId);
});
