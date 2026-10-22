// The redirect decision, as a pure function of what the background script
// observed (see AGENTS.md "How it decides"). Firefox on Windows reports a DNS
// block exactly like a non-existent name (NS_ERROR_UNKNOWN_HOST), so "unknown
// host while DNS otherwise works" is treated as blocked; a working canary lookup
// rules out being offline or Pi-hole being down.
// Loaded as a classic script: exposes globalThis.SF_DECIDE.
(() => {
  "use strict";

  const UNKNOWN_HOST = 0x804b001e; // NS_ERROR_UNKNOWN_HOST
  const BINDING_ABORTED = 0x804b0002; // NS_BINDING_ABORTED

  // webNavigation's details.error is "Error code <decimal nsresult>" in Firefox 158;
  // also accept a symbolic name in case that format changes. Missing → "missing".
  function classifyError(error) {
    if (error == null || error === "") return "missing";
    const s = String(error);
    const num = /(\d{6,})/.exec(s);
    const code = num ? Number(num[1]) : null;
    if (code === UNKNOWN_HOST || s.includes("NS_ERROR_UNKNOWN_HOST")) return "unknown-host";
    if (code === BINDING_ABORTED || s.includes("NS_BINDING_ABORTED")) return "aborted";
    return "other";
  }

  // A lookup result is { addresses: [...], isTRR } or { rejected: "<error name>" }.
  function isUnknownHost(result) {
    return result?.rejected === "NS_ERROR_UNKNOWN_HOST";
  }

  function resolvedToRealAddress(result) {
    return (
      Array.isArray(result?.addresses) &&
      result.addresses.some((a) => !globalThis.SF_ADDRESS.isNullAddress(a))
    );
  }

  // Step 1: is this navigation error worth any DNS work at all?
  function shouldInvestigate(details) {
    if (details.frameId !== 0) return false;
    const kind = classifyError(details.error);
    return kind === "unknown-host" || kind === "missing";
  }

  // Step 2: given the lookups, redirect or not. Returns { redirect, reason }.
  //   host:   dns.resolve() of the failed hostname
  //   canary: dns.resolve() of a name that should always resolve
  //   online: navigator.onLine in the background page
  function decide({ host, canary, online }) {
    if (!online) return { redirect: false, reason: "offline" };
    if (host && globalThis.SF_ADDRESS.isBlockedAnswer(host.addresses)) {
      // Resolvers that pass 0.0.0.0 / :: through (not Windows) — unambiguous.
      return { redirect: true, reason: "null-answer" };
    }
    if (!isUnknownHost(host)) return { redirect: false, reason: "host-resolves-or-other-error" };
    if (!resolvedToRealAddress(canary)) return { redirect: false, reason: "dns-not-working" };
    return { redirect: true, reason: "unknown-host" };
  }

  globalThis.SF_DECIDE = { classifyError, shouldInvestigate, decide };
})();
