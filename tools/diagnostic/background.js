// Diagnostic-only background (not part of the shipped extension). Records, for
// every failed http(s) load: the webNavigation error event, the webRequest error
// string (which Firefox's webNavigation event doesn't carry), and for main-frame
// failures the dns.resolve() answer. Log lives in storage.local (the MV3 event
// page can be unloaded between events), viewable via the toolbar button.
"use strict";

const LOG_KEY = "diagLog";
const MAX_ENTRIES = 300;
let writeChain = Promise.resolve();

function log(entry) {
  const record = { at: new Date().toISOString(), ...entry };
  console.log("[sf-diagnostic]", record);
  writeChain = writeChain.then(async () => {
    const { [LOG_KEY]: list = [] } = await browser.storage.local.get(LOG_KEY);
    list.push(record);
    await browser.storage.local.set({ [LOG_KEY]: list.slice(-MAX_ENTRIES) });
  });
  return writeChain;
}

async function resolveBoth(host) {
  const out = {};
  for (const [label, flags] of [
    ["cached", ["canonical_name"]],
    ["bypassCache", ["canonical_name", "bypass_cache"]],
  ]) {
    try {
      const rec = await browser.dns.resolve(host, flags);
      out[label] = { addresses: rec.addresses, canonicalName: rec.canonicalName, isTRR: rec.isTRR };
    } catch (err) {
      out[label] = { rejected: String(err?.message ?? err) };
    }
  }
  return out;
}

browser.runtime.onStartup.addListener(logStartup);
browser.runtime.onInstalled.addListener(logStartup);

async function logStartup() {
  const info = await browser.runtime.getBrowserInfo();
  log({
    ev: "startup",
    browser: `${info.name} ${info.version}`,
    manifestVersion: browser.runtime.getManifest().manifest_version,
    dnsApi: typeof browser.dns?.resolve,
    allUrlsGranted: await browser.permissions.contains({ origins: ["<all_urls>"] }),
  });
}

browser.webNavigation.onErrorOccurred.addListener(
  async (d) => {
    const entry = {
      ev: "webNavigation.onErrorOccurred",
      tabId: d.tabId,
      frameId: d.frameId,
      url: d.url,
      error: d.error,
      detailKeys: Object.keys(d).sort(),
    };
    if (d.frameId === 0) {
      let host = null;
      try {
        host = new URL(d.url).hostname;
      } catch {}
      if (host) entry.dns = await resolveBoth(host);
      // What does the tab itself report while the error page is up?
      await new Promise((r) => setTimeout(r, 300));
      try {
        const tab = await browser.tabs.get(d.tabId);
        entry.tabUrlAfter300ms = tab.url;
        entry.tabStatus = tab.status;
      } catch (err) {
        entry.tabUrlAfter300ms = `tabs.get failed: ${err?.message ?? err}`;
      }
    }
    log(entry);
  },
  { url: [{ schemes: ["http", "https"] }] }
);

browser.webRequest.onErrorOccurred.addListener(
  (d) => {
    log({
      ev: "webRequest.onErrorOccurred",
      tabId: d.tabId,
      frameId: d.frameId,
      type: d.type,
      method: d.method,
      url: d.url,
      error: d.error,
      ip: d.ip,
      originUrl: d.originUrl,
      documentUrl: d.documentUrl,
    });
  },
  { urls: ["<all_urls>"], types: ["main_frame", "sub_frame"] }
);

browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("log.html") });
});
