// Decides which failed navigations are even worth a DNS check, and extracts the
// hostname to check. Everything here is a pure function of the URL string.
// Loaded as a classic script (no modules): exposes globalThis.SF_URL.
(() => {
  "use strict";

  const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

  // Returns the lowercase hostname (no trailing dot) to DNS-check, or null when the
  // URL must be ignored: non-http(s) schemes (about:, moz-extension:, file:, data:,
  // view-source:, ...), IP literals, localhost, or unparseable input.
  function candidateHost(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!host) return null;
    if (host.startsWith("[") || host.includes(":")) return null; // IPv6 literal
    if (IPV4_LITERAL.test(host)) return null;
    if (host === "localhost" || host.endsWith(".localhost")) return null;
    return host;
  }

  globalThis.SF_URL = { candidateHost };
})();
