// Options page: edits the config in storage.local (default title and "what to
// show" entries, per-site rules with time-of-day entries), shows/resets attempt
// counts, and warns if DoH was seen. Edits mutate `state`; structural changes
// re-render.
// Built with createElement/textContent only.
"use strict";

const $ = (id) => document.getElementById(id);
const { CONFIG_KEY, ATTEMPTS_KEY, DOH_SEEN_KEY, DEBUG_KEY, LOG_KEY } = SF_CONFIG;
const PREVIEW_URL = "https://blocked.example/";
const SHOW_KINDS_FOR_UI = SF_CONFIG.SHOW_KINDS;

let state = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === "text") node.textContent = v;
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

function setStatus(text) {
  $("status").textContent = text;
}

function markDirty() {
  setStatus("Unsaved changes");
}

function move(list, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

const SHOW_LABELS = {
  message: "Message page",
  page: "Web page (your URL)",
  blank: "Blank page",
  close: "Close the tab",
};

// Opens what an entry would show, using the unsaved values on screen.
// `context()` returns { title, sampleUrl } for the list the entry belongs to.
function previewEntry(m, context) {
  const { title, sampleUrl } = context();
  const show = m.show ?? "message";
  const blocked = encodeURIComponent(sampleUrl);
  if (show === "message") {
    const q = new URLSearchParams({ url: sampleUrl, preview: "1", title, text: m.text ?? "" });
    browser.tabs.create({ url: browser.runtime.getURL("src/blocked/blocked.html") + "?" + q });
  } else if (show === "page") {
    const host = new URL(sampleUrl).hostname;
    const target = SF_RULES.renderUrl(m.url, { url: sampleUrl, host, count: 1, time: "12:00" });
    if (target) browser.tabs.create({ url: target });
    else setStatus("Preview: the page address must be a full http:// or https:// URL");
  } else if (show === "blank") {
    browser.tabs.create({ url: browser.runtime.getURL("src/blank/blank.html") + "?url=" + blocked });
  } else {
    setStatus("Preview: this entry closes the tab.");
  }
}

// Order doesn't matter: one fitting entry is picked at random (timed ones first),
// so there are no move buttons here.
function entryEditor(entries, rerender, context) {
  const box = el("div");
  entries.forEach((m, i) => {
    const show = m.show ?? "message";
    const kind = el(
      "select",
      {
        on: {
          change: (e) => {
            m.show = e.target.value;
            rerender();
          },
        },
      },
      SHOW_KINDS_FOR_UI.map((k) => el("option", { value: k, text: SHOW_LABELS[k], selected: k === show }))
    );
    let body;
    if (show === "message") {
      body = el("textarea", {
        value: m.text ?? "",
        placeholder: "Message text — {host}, {url}, {count}, {time} are filled in",
        on: { input: (e) => ((m.text = e.target.value), markDirty()) },
      });
    } else if (show === "page") {
      body = el("div", {}, [
        el("input", {
          type: "text",
          className: "sf-url-input",
          value: m.url ?? "",
          placeholder: "https://example.com/todo?from={host}",
          on: { input: (e) => ((m.url = e.target.value), markDirty()) },
        }),
        el("p", {
          className: "sf-muted sf-hint",
          text:
            "{url} (or LeechBlock's $U), {host}, {count}, {time} are filled in, URL-encoded. " +
            "Using {url}/{host} tells that site what was blocked.",
        }),
      ]);
    } else {
      body = el("p", {
        className: "sf-muted sf-hint",
        text: show === "blank" ? "Shows an empty page titled with the blocked site." : "Closes the tab (and the window, if it's the last tab).",
      });
    }
    const from = el("input", {
      type: "time",
      value: m.from ?? "",
      on: { input: (e) => ((m.from = e.target.value), markDirty()) },
    });
    const to = el("input", {
      type: "time",
      value: m.to ?? "",
      on: { input: (e) => ((m.to = e.target.value), markDirty()) },
    });
    box.append(
      el("div", { className: "sf-msg" }, [
        el("label", { className: "sf-field" }, ["Show", kind]),
        body,
        el("div", { className: "sf-msg-times" }, [
          el("span", { className: "sf-muted", text: "Only between" }),
          from,
          el("span", { className: "sf-muted", text: "and" }),
          to,
          el("span", { className: "sf-muted", text: "(empty = any time)" }),
          el("span", { className: "sf-spacer" }),
          el("button", { type: "button", text: "Preview", on: { click: () => previewEntry(m, context) } }),
          el("button", { type: "button", text: "Remove", on: { click: () => (entries.splice(i, 1), rerender()) } }),
        ]),
      ])
    );
  });
  box.append(
    el("button", {
      type: "button",
      text: "+ Add entry",
      on: { click: () => (entries.push({ text: "" }), rerender()) },
    })
  );
  return box;
}

function previewUrlForRule(rule) {
  const name = rule.pattern.replace(/^(=|\*\.)/, "");
  const host = rule.pattern.startsWith("*.") ? "www." + name : name;
  return `https://${host}${rule.path || "/"}`;
}

function openPreview(url) {
  browser.tabs.create({
    url: browser.runtime.getURL("src/blocked/blocked.html") + "?url=" + encodeURIComponent(url),
  });
}

function renderRules() {
  const box = $("rules");
  box.replaceChildren();
  state.rules.forEach((r, i) => {
    const rerender = () => (markDirty(), renderRules());
    box.append(
      el("div", { className: "sf-rule" }, [
        el("label", { className: "sf-field" }, [
          "Site",
          el("input", {
            type: "text",
            value: r.pattern,
            placeholder: "example.com",
            on: { input: (e) => ((r.pattern = e.target.value), markDirty()) },
          }),
        ]),
        el("label", { className: "sf-field" }, [
          "Path",
          el("input", {
            type: "text",
            value: r.path,
            placeholder: "optional, e.g. /r/news",
            on: { input: (e) => ((r.path = e.target.value), markDirty()) },
          }),
        ]),
        el("label", { className: "sf-field" }, [
          "Title",
          el("input", {
            type: "text",
            value: r.title,
            placeholder: "empty = default title",
            on: { input: (e) => ((r.title = e.target.value), markDirty()) },
          }),
        ]),
        entryEditor(r.messages, rerender, () => ({
          title: r.title || state.defaults.title,
          sampleUrl: previewUrlForRule(r),
        })),
        el("div", { className: "sf-row" }, [
          el("label", {}, [
            el("input", {
              type: "checkbox",
              checked: r.enabled,
              on: { change: (e) => ((r.enabled = e.target.checked), markDirty()) },
            }),
            " Enabled",
          ]),
          el("span", { className: "sf-spacer" }),
          el("button", {
            type: "button",
            text: "Preview (saved)",
            title: "Opens the message page for this site using the saved settings",
            on: { click: () => openPreview(previewUrlForRule(r)) },
          }),
          el("button", { type: "button", text: "↑", title: "Move up", on: { click: () => (move(state.rules, i, -1), rerender()) } }),
          el("button", { type: "button", text: "↓", title: "Move down", on: { click: () => (move(state.rules, i, 1), rerender()) } }),
          el("button", { type: "button", text: "Delete rule", on: { click: () => (state.rules.splice(i, 1), rerender()) } }),
        ]),
      ])
    );
  });
}

function renderDefaults() {
  $("default-title").value = state.defaults.title;
  $("show-count").checked = state.showCount;
  const rerender = () => (markDirty(), renderDefaults());
  $("default-messages").replaceChildren(
    entryEditor(state.defaults.messages, rerender, () => ({ title: state.defaults.title, sampleUrl: PREVIEW_URL }))
  );
}

function renderAll() {
  renderDefaults();
  renderRules();
}

// Returns a list of human-readable problems; saving is refused while any exist,
// so nothing the user typed is silently dropped by normalizeConfig.
function problems() {
  const out = [];
  const checkMessages = (list, where) =>
    list.forEach((m, i) => {
      const p = SF_CONFIG.messageProblem(m);
      if (p) out.push(`${where}, entry ${i + 1}: ${p}`);
    });
  if (!state.defaults.messages.length) out.push("Default: needs at least one entry");
  checkMessages(state.defaults.messages, "Default");
  state.rules.forEach((r, i) => {
    const where = `Rule ${i + 1}${r.pattern ? ` (${r.pattern})` : ""}`;
    if (!SF_CONFIG.isValidPattern(SF_CONFIG.cleanPattern(r.pattern))) out.push(`${where}: not a valid site pattern`);
    checkMessages(r.messages, where);
  });
  return out;
}

async function save() {
  const found = problems();
  if (found.length) {
    setStatus("Not saved — " + found.join("; "));
    return;
  }
  state = SF_CONFIG.normalizeConfig(state);
  await browser.storage.local.set({ [CONFIG_KEY]: state });
  renderAll();
  setStatus("Saved");
}

async function renderAttempts() {
  const { [ATTEMPTS_KEY]: map = {} } = await browser.storage.local.get(ATTEMPTS_KEY);
  const fmt = (iso) => new Date(iso).toLocaleString();
  const rows = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  const body = $("attempts");
  body.replaceChildren();
  if (!rows.length) {
    body.append(el("tr", {}, [el("td", { colSpan: 5, className: "sf-muted", text: "No attempts yet." })]));
  }
  for (const [host, a] of rows) {
    body.append(
      el("tr", {}, [
        el("td", { className: "sf-host", text: host }),
        el("td", { text: String(a.count) }),
        el("td", { text: fmt(a.first) }),
        el("td", { text: fmt(a.last) }),
        el("td", {}, [
          el("button", {
            type: "button",
            text: "Reset",
            on: {
              click: async () => {
                const { [ATTEMPTS_KEY]: cur = {} } = await browser.storage.local.get(ATTEMPTS_KEY);
                delete cur[host];
                await browser.storage.local.set({ [ATTEMPTS_KEY]: cur });
              },
            },
          }),
        ]),
      ])
    );
  }
}

async function renderDohWarning() {
  const { [DOH_SEEN_KEY]: seen } = await browser.storage.local.get(DOH_SEEN_KEY);
  $("doh-warning").hidden = !seen;
  if (seen) $("doh-when").textContent = new Date(seen).toLocaleString();
}

async function renderLog() {
  const { [DEBUG_KEY]: on, [LOG_KEY]: list = [] } = await browser.storage.local.get([DEBUG_KEY, LOG_KEY]);
  $("debug").checked = Boolean(on);
  $("log").textContent = list.length ? JSON.stringify(list, null, 2) : "(empty)";
}

async function init() {
  const { [CONFIG_KEY]: stored } = await browser.storage.local.get(CONFIG_KEY);
  state = SF_CONFIG.normalizeConfig(stored);
  renderAll();
  renderAttempts();
  renderDohWarning();
  renderLog();

  $("default-title").addEventListener("input", (e) => ((state.defaults.title = e.target.value), markDirty()));
  $("show-count").addEventListener("change", (e) => ((state.showCount = e.target.checked), markDirty()));
  $("add-rule").addEventListener("click", () => {
    state.rules.push({ pattern: "", path: "", enabled: true, title: "", messages: [{ text: "" }] });
    markDirty();
    renderRules();
  });
  $("save").addEventListener("click", save);
  $("preview").addEventListener("click", () => openPreview(PREVIEW_URL));
  $("restore").addEventListener("click", () => {
    if (!confirm("Replace all messages and rules with the shipped defaults? (Click Save to keep.)")) return;
    state = structuredClone(SF_CONFIG.DEFAULT_CONFIG);
    renderAll();
    markDirty();
  });
  $("reset-all").addEventListener("click", async () => {
    if (confirm("Reset all attempt counts?")) await browser.storage.local.remove(ATTEMPTS_KEY);
  });
  $("debug").addEventListener("change", (e) => browser.storage.local.set({ [DEBUG_KEY]: e.target.checked }));
  $("log-clear").addEventListener("click", () => browser.storage.local.remove(LOG_KEY));
  $("log-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("log").textContent);
    setStatus("Log copied");
  });
  $("doh-dismiss").addEventListener("click", () => browser.storage.local.remove(DOH_SEEN_KEY));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (ATTEMPTS_KEY in changes) renderAttempts();
    if (DOH_SEEN_KEY in changes) renderDohWarning();
    if (LOG_KEY in changes || DEBUG_KEY in changes) renderLog();
  });
}

init().catch((err) => {
  console.error("[something-fishy] options failed to load", err);
  setStatus("Failed to load settings: " + err);
});
