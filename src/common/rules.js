// Picks what to show for a blocked URL: rule matching (hostname pattern +
// optional path prefix), time-of-day windows, a random pick among the entries
// that fit, and {placeholder} rendering for message text and page URLs.
// Pure functions only; callers pass in config, the clock and the random source.
// Loaded as a classic script: exposes globalThis.SF_RULES.
(() => {
  "use strict";

  // Pattern forms (see README "Customizing messages"):
  //   "example.com"    the domain itself and every subdomain
  //   "=example.com"   exactly that hostname
  //   "*.example.com"  subdomains only, not example.com itself
  function hostMatches(pattern, host) {
    if (pattern.startsWith("=")) return host === pattern.slice(1);
    if (pattern.startsWith("*.")) return host.endsWith(pattern.slice(1));
    return host === pattern || host.endsWith("." + pattern);
  }

  // First enabled rule that matches wins, so rule order on the options page is
  // the priority order. Returns the rule's index, or -1.
  function findRule(rules, url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return -1;
    }
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    return rules.findIndex(
      (r) => r.enabled && hostMatches(r.pattern, host) && (!r.path || u.pathname.startsWith(r.path))
    );
  }

  function clockMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  // Local-time window [from, to). Wraps past midnight when from > to
  // ("23:00"–"05:00"); from === to means all day.
  function inWindow(from, to, date) {
    const now = date.getHours() * 60 + date.getMinutes();
    const a = clockMinutes(from);
    const b = clockMinutes(to);
    if (a === b) return true;
    return a < b ? now >= a && now < b : now >= a || now < b;
  }

  // Picks one entry index at random among those whose window contains `date`.
  // If any *timed* entry fits, the pick is among those only, so a 23:00–05:00
  // message reliably takes over at night instead of competing with all-day ones.
  // `accept` can exclude kinds (the message page only renders "message" entries).
  function chooseEntry(entries, date, rng, accept = () => true) {
    const fitting = [];
    entries.forEach((m, i) => {
      if (accept(m) && (!m.from || inWindow(m.from, m.to, date))) fitting.push(i);
    });
    const timed = fitting.filter((i) => entries[i].from);
    const pool = timed.length ? timed : fitting;
    if (!pool.length) return -1;
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }

  // Returns { title, entry, ruleIndex, entryIndex }, where entryIndex points into
  // the matching rule's list (ruleIndex >= 0) or the default list (ruleIndex -1
  // after a fallback). A matching rule with nothing for this time of day falls
  // back to the default entries; entry is null only if nothing fits at all.
  function pickEntry(config, url, date, rng = Math.random, accept) {
    const matched = findRule(config.rules, url);
    const rule = matched >= 0 ? config.rules[matched] : null;
    const title = (rule && rule.title) || config.defaults.title;
    if (rule) {
      const i = chooseEntry(rule.messages, date, rng, accept);
      if (i >= 0) return { title, entry: rule.messages[i], ruleIndex: matched, entryIndex: i };
    }
    const i = chooseEntry(config.defaults.messages, date, rng, accept);
    return { title, entry: i >= 0 ? config.defaults.messages[i] : null, ruleIndex: -1, entryIndex: i };
  }

  // Looks up an entry by the indices pickEntry returned (passed to the message
  // page in its URL). Returns null if the config changed and they're stale.
  function entryAt(config, ruleIndex, entryIndex) {
    const list = ruleIndex >= 0 ? config.rules[ruleIndex]?.messages : config.defaults.messages;
    return list?.[entryIndex] ?? null;
  }

  // Replaces {host}, {url}, {count}, {time}; unknown placeholders are left as is.
  // Output is plain text — callers must insert it with textContent.
  function renderTemplate(text, vars) {
    return String(text).replace(/\{(host|url|count|time)\}/g, (whole, key) =>
      vars[key] == null ? whole : String(vars[key])
    );
  }

  // Fills a page-URL template. Placeholders {url}, {host}, {count}, {time} and
  // LeechBlock's $U (= {url}) are URL-encoded, so they're safe in a query string.
  // Returns the URL string, or null unless the result is a valid http(s) URL.
  function renderUrl(template, vars) {
    if (typeof template !== "string" || !template.trim()) return null;
    const filled = template
      .trim()
      .replace(/\$U/g, "{url}")
      .replace(/\{(host|url|count|time)\}/g, (whole, key) =>
        vars[key] == null ? whole : encodeURIComponent(String(vars[key]))
      );
    try {
      const u = new URL(filled);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  globalThis.SF_RULES = {
    hostMatches,
    findRule,
    inWindow,
    chooseEntry,
    pickEntry,
    entryAt,
    renderTemplate,
    renderUrl,
  };
})();
