// Options page: edits the config in storage.local (default title/messages,
// per-site rules with time-of-day messages), shows/resets attempt counts, and
// warns if DoH was seen. Edits mutate `state`; structural changes re-render.
// Built with createElement/textContent only.
"use strict";

const $ = (id) => document.getElementById(id);
const { CONFIG_KEY, ATTEMPTS_KEY, DOH_SEEN_KEY } = SF_CONFIG;
const PREVIEW_URL = "https://blocked.example/";

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

function messageEditor(messages, rerender) {
  const box = el("div");
  messages.forEach((m, i) => {
    const text = el("textarea", {
      value: m.text,
      placeholder: "Message text — {host}, {url}, {count}, {time} are filled in",
      on: { input: (e) => ((m.text = e.target.value), markDirty()) },
    });
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
        text,
        el("div", { className: "sf-msg-times" }, [
          el("span", { className: "sf-muted", text: "Only between" }),
          from,
          el("span", { className: "sf-muted", text: "and" }),
          to,
          el("span", { className: "sf-muted", text: "(empty = any time)" }),
          el("span", { className: "sf-spacer" }),
          el("button", { type: "button", text: "↑", title: "Move up", on: { click: () => (move(messages, i, -1), rerender()) } }),
          el("button", { type: "button", text: "↓", title: "Move down", on: { click: () => (move(messages, i, 1), rerender()) } }),
          el("button", { type: "button", text: "Remove", on: { click: () => (messages.splice(i, 1), rerender()) } }),
        ]),
      ])
    );
  });
  box.append(
    el("button", {
      type: "button",
      text: "+ Add message",
      on: { click: () => (messages.push({ text: "" }), rerender()) },
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
        messageEditor(r.messages, rerender),
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
          el("button", { type: "button", text: "Preview", on: { click: () => openPreview(previewUrlForRule(r)) } }),
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
  $("default-messages").replaceChildren(messageEditor(state.defaults.messages, rerender));
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
      if (p) out.push(`${where}, message ${i + 1}: ${p}`);
    });
  if (!state.defaults.messages.length) out.push("Default: needs at least one message");
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

async function init() {
  const { [CONFIG_KEY]: stored } = await browser.storage.local.get(CONFIG_KEY);
  state = SF_CONFIG.normalizeConfig(stored);
  renderAll();
  renderAttempts();
  renderDohWarning();

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
  $("doh-dismiss").addEventListener("click", () => browser.storage.local.remove(DOH_SEEN_KEY));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (ATTEMPTS_KEY in changes) renderAttempts();
    if (DOH_SEEN_KEY in changes) renderDohWarning();
  });
}

init().catch((err) => {
  console.error("[something-fishy] options failed to load", err);
  setStatus("Failed to load settings: " + err);
});
