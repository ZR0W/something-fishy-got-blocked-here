// The shipped default config, plus normalizeConfig(), which turns whatever is in
// storage (possibly old, partial, or hand-edited) into a config the rest of the
// code can trust. Loaded as a classic script: exposes globalThis.SF_CONFIG.
// Schema is documented in AGENTS.md ("Settings / storage schema").
(() => {
  "use strict";

  const CONFIG_KEY = "sfConfig";
  const ATTEMPTS_KEY = "sfAttempts";
  const DOH_SEEN_KEY = "sfDohSeen";
  const DEBUG_KEY = "sfDebug";
  const LOG_KEY = "sfDecisionLog";
  const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

  // Placeholder wording ("encouraging discouragement") — edit on the options page.
  const DEFAULT_CONFIG = Object.freeze({
    version: 1,
    showCount: true,
    defaults: {
      title: "Something fishy 🐟",
      messages: [
        {
          from: "23:00",
          to: "05:00",
          text: "It's late. {host} is blocked, and so is this train of thought. Go to sleep — it'll still be blocked tomorrow.",
        },
        {
          from: "05:00",
          to: "10:00",
          text: "Good morning! {host} is blocked. Not starting the day here is already a win.",
        },
        {
          text: "{host} got caught in the net. Whatever you were about to do there, you've got better things to do. Go do one of them.",
        },
      ],
    },
    rules: [
      {
        pattern: "doubleclick.net",
        path: "",
        enabled: true,
        title: "Just an ad server",
        messages: [{ text: "{host} serves ads. Nothing of value was lost." }],
      },
    ],
  });

  // An entry in a messages[] list says what to show for a block. `show` is
  // "message" (default when absent, so v1 configs load unchanged), "page" (a URL
  // template), "blank" (shipped blank page) or "close" (close the tab).
  const SHOW_KINDS = ["message", "page", "blank", "close"];

  // Placeholder values used only to check that a page template yields a valid URL.
  const SAMPLE_VARS = { url: "https://blocked.example/", host: "blocked.example", count: 1, time: "12:00" };

  // Why an entry would be dropped, or "" if it's fine. A half-specified or
  // malformed window is rejected rather than silently widened to "all day"
  // (that would show the 3 a.m. message at noon).
  function messageProblem(m) {
    if (!m || typeof m !== "object") return "empty entry";
    const show = m.show ?? "message";
    if (!SHOW_KINDS.includes(show)) return `unknown kind "${show}"`;
    if (show === "message" && (typeof m.text !== "string" || !m.text.trim())) return "empty message";
    if (show === "page" && !globalThis.SF_RULES?.renderUrl(m.url, SAMPLE_VARS)) {
      return "page address must be a full http:// or https:// URL";
    }
    const hasFrom = m.from != null && m.from !== "";
    const hasTo = m.to != null && m.to !== "";
    if (!hasFrom && !hasTo) return "";
    if (!CLOCK.test(String(m.from)) || !CLOCK.test(String(m.to))) {
      return "time window needs both a start and an end (HH:MM)";
    }
    return "";
  }

  // Keeps only the fields that matter for each kind ("message" entries keep the
  // v1 shape: { text, from?, to? }).
  function cleanMessages(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((m) => !messageProblem(m))
      .map((m) => {
        const show = m.show ?? "message";
        const out = show === "message" ? {} : { show };
        if (m.from) Object.assign(out, { from: m.from, to: m.to });
        if (show === "message") out.text = m.text;
        if (show === "page") out.url = m.url.trim();
        return out;
      });
  }

  // Lowercases, drops a trailing dot, and converts non-ASCII names to punycode
  // (URL hostnames arrive as "xn--..."), keeping any "=" / "*." prefix.
  function cleanPattern(p) {
    const s = String(p ?? "").trim().toLowerCase();
    const prefix = /^(=|\*\.)/.exec(s)?.[0] ?? "";
    let name = s.slice(prefix.length).replace(/\.$/, "");
    try {
      name = new URL("http://" + name).hostname;
    } catch {
      return "";
    }
    return prefix + name;
  }

  function isValidPattern(cleaned) {
    return /^(=|\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(cleaned);
  }

  function normalizeConfig(raw) {
    const base = structuredClone(DEFAULT_CONFIG);
    if (!raw || typeof raw !== "object") return base;

    const defaults = {
      title:
        typeof raw.defaults?.title === "string" && raw.defaults.title.trim()
          ? raw.defaults.title
          : base.defaults.title,
      messages: cleanMessages(raw.defaults?.messages),
    };
    if (!defaults.messages.length) defaults.messages = base.defaults.messages;

    const rules = [];
    for (const r of Array.isArray(raw.rules) ? raw.rules : []) {
      const pattern = cleanPattern(r?.pattern);
      if (!isValidPattern(pattern)) continue;
      const path = typeof r.path === "string" ? r.path.trim() : "";
      rules.push({
        pattern,
        path: path && !path.startsWith("/") ? "/" + path : path,
        enabled: r.enabled !== false,
        title: typeof r.title === "string" ? r.title : "",
        messages: cleanMessages(r.messages),
      });
    }

    return {
      version: 1,
      showCount: raw.showCount !== false,
      defaults,
      rules: Array.isArray(raw.rules) ? rules : base.rules,
    };
  }

  globalThis.SF_CONFIG = {
    CONFIG_KEY,
    ATTEMPTS_KEY,
    DOH_SEEN_KEY,
    DEBUG_KEY,
    LOG_KEY,
    DEFAULT_CONFIG,
    normalizeConfig,
    cleanPattern,
    isValidPattern,
    messageProblem,
    SHOW_KINDS,
  };
})();
