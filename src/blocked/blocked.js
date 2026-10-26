// The message page the background script swaps in for Firefox's error page.
// Reads ?url=<the blocked URL>, picks a message from the stored config, and
// renders it. All text goes in via textContent (message text is never HTML).
// There is deliberately no "continue anyway": the block is real.
"use strict";

const $ = (id) => document.getElementById(id);

function pad2(n) {
  return String(n).padStart(2, "0");
}

async function render() {
  const blockedUrl = new URLSearchParams(location.search).get("url") ?? "";
  let host = "this site";
  try {
    host = new URL(blockedUrl).hostname || host;
  } catch {
    // keep the fallback
  }

  const stored = await browser.storage.local.get([SF_CONFIG.CONFIG_KEY, SF_CONFIG.ATTEMPTS_KEY]);
  const config = SF_CONFIG.normalizeConfig(stored[SF_CONFIG.CONFIG_KEY]);
  const attempt = stored[SF_CONFIG.ATTEMPTS_KEY]?.[host];
  const now = new Date();
  const vars = {
    host,
    url: blockedUrl,
    count: attempt?.count ?? 0,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
  };

  // The background passes the entry it picked (?r=<rule index>&e=<entry index>);
  // the options page's per-entry Preview passes ?preview=1&title=&text=. With
  // neither (or stale indices), pick a message here.
  const params = new URLSearchParams(location.search);
  const isMessage = (m) => Boolean(m) && (m.show ?? "message") === "message";
  let title = SF_RULES.pickEntry(config, blockedUrl, now).title;
  let text;
  if (params.get("preview") === "1") {
    title = params.get("title") || title;
    text = params.get("text") ?? "";
  } else {
    const given = SF_RULES.entryAt(config, Number(params.get("r") ?? NaN), Number(params.get("e") ?? NaN));
    text = isMessage(given)
      ? given.text
      : (SF_RULES.pickEntry(config, blockedUrl, now, Math.random, isMessage).entry?.text ?? "");
  }
  const shownTitle = SF_RULES.renderTemplate(title, vars);
  document.title = shownTitle;
  $("title").textContent = shownTitle;
  $("message").textContent = SF_RULES.renderTemplate(text, vars);
  $("url").textContent = blockedUrl;
  $("host-inline").textContent = host;

  if (config.showCount && attempt?.count) {
    const since = new Date(attempt.first).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    $("count").textContent =
      attempt.count === 1 ? "First attempt." : `Attempt #${attempt.count} since ${since}.`;
    $("count").hidden = false;
  }
}

$("back").disabled = history.length <= 1;
$("back").addEventListener("click", () => history.back());
$("close").addEventListener("click", async () => {
  const tab = await browser.tabs.getCurrent();
  if (tab) browser.tabs.remove(tab.id);
});
$("options").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

render().catch((err) => {
  console.error("[something-fishy] render failed", err);
  $("title").textContent = "Blocked";
});
