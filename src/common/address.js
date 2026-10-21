// Decides whether a DNS answer is the "null" answer Pi-hole (and Cloudflare for
// Families, passed through Pi-hole) gives for a blocked name: 0.0.0.0 / ::.
// Loaded as a classic script (no modules): exposes globalThis.SF_ADDRESS.
// Also loadable from Node for tests (require() runs the IIFE).
(() => {
  "use strict";

  // Expands an IPv6 string to 8 numeric groups, or returns null if malformed.
  // Handles "::" compression, zone ids ("fe80::1%eth0") and an embedded IPv4
  // tail ("::ffff:0.0.0.0").
  function ipv6Groups(text) {
    let s = String(text).toLowerCase().split("%")[0];
    const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
    if (v4) {
      const b = v4.slice(1).map(Number);
      if (b.some((n) => n > 255)) return null;
      const hi = ((b[0] << 8) | b[1]).toString(16);
      const lo = ((b[2] << 8) | b[3]).toString(16);
      s = s.slice(0, v4.index) + hi + ":" + lo;
    }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const parse = (part) => (part === "" ? [] : part.split(":"));
    const head = parse(halves[0]);
    const tail = halves.length === 2 ? parse(halves[1]) : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
    if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map((g) => parseInt(g, 16));
  }

  function isNullAddress(addr) {
    const s = String(addr ?? "").trim();
    if (s === "0.0.0.0") return true;
    if (!s.includes(":")) return false;
    const g = ipv6Groups(s);
    if (!g) return false;
    // "::" (all zero), or "::ffff:0.0.0.0" (IPv4-mapped 0.0.0.0).
    const firstFiveZero = g.slice(0, 5).every((n) => n === 0);
    return firstFiveZero && (g[5] === 0 || g[5] === 0xffff) && g[6] === 0 && g[7] === 0;
  }

  // "Blocked by my DNS" = the name resolved, and every address is a null address.
  // An empty list is NOT blocked (that's a no-answer, which we don't claim).
  function isBlockedAnswer(addresses) {
    return Array.isArray(addresses) && addresses.length > 0 && addresses.every(isNullAddress);
  }

  globalThis.SF_ADDRESS = { isNullAddress, isBlockedAnswer, ipv6Groups };
})();
