// Local-only attempt counter: { [hostname]: { count, first, last } } with ISO
// timestamps. Pure helpers; the background script does the storage I/O.
// Loaded as a classic script: exposes globalThis.SF_ATTEMPTS.
(() => {
  "use strict";

  const MAX_HOSTS = 500; // oldest-by-last entries are dropped beyond this

  function recordAttempt(map, host, nowIso) {
    const next = { ...(map && typeof map === "object" ? map : {}) };
    const prev = next[host];
    next[host] = {
      count: (prev?.count ?? 0) + 1,
      first: prev?.first ?? nowIso,
      last: nowIso,
    };
    const hosts = Object.keys(next);
    if (hosts.length > MAX_HOSTS) {
      hosts
        .sort((a, b) => String(next[a].last).localeCompare(String(next[b].last)))
        .slice(0, hosts.length - MAX_HOSTS)
        .forEach((h) => delete next[h]);
    }
    return next;
  }

  globalThis.SF_ATTEMPTS = { MAX_HOSTS, recordAttempt };
})();
