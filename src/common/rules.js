// Picks which message to show for a blocked URL: rule matching (hostname
// pattern + optional path prefix), time-of-day windows, and {placeholder}
// rendering. Pure functions only; callers pass in config and the clock.
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

  // First message whose window contains `date` (untimed messages always match).
  function firstMessage(messages, date) {
    return messages.find((m) => !m.from || inWindow(m.from, m.to, date)) ?? null;
  }

  // Returns { title, text, ruleIndex } with text still a template. A matching rule
  // with no message for this time of day falls back to the default messages.
  function pickMessage(config, url, date) {
    const ruleIndex = findRule(config.rules, url);
    const rule = ruleIndex >= 0 ? config.rules[ruleIndex] : null;
    const fromRule = rule ? firstMessage(rule.messages, date) : null;
    const msg = fromRule ?? firstMessage(config.defaults.messages, date);
    return {
      title: (rule && rule.title) || config.defaults.title,
      text: msg ? msg.text : "",
      ruleIndex,
    };
  }

  // Replaces {host}, {url}, {count}, {time}; unknown placeholders are left as is.
  // Output is plain text — callers must insert it with textContent.
  function renderTemplate(text, vars) {
    return String(text).replace(/\{(host|url|count|time)\}/g, (whole, key) =>
      vars[key] == null ? whole : String(vars[key])
    );
  }

  globalThis.SF_RULES = { hostMatches, findRule, inWindow, pickMessage, renderTemplate };
})();
