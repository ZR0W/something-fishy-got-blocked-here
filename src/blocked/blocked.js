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

  const picked = SF_RULES.pickMessage(config, blockedUrl, now);
  const title = SF_RULES.renderTemplate(picked.title, vars);
  document.title = title;
  $("title").textContent = title;
  $("message").textContent = SF_RULES.renderTemplate(picked.text, vars);
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
