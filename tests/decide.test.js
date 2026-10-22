"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/address.js");
require("../src/common/decide.js");
const { classifyError, shouldInvestigate, decide } = globalThis.SF_DECIDE;

const OK = { addresses: ["104.20.23.154", "2606:4700:10::6814:179a"], isTRR: false };
const UNKNOWN = { rejected: "NS_ERROR_UNKNOWN_HOST" };

test("classifyError: formats seen in Firefox 158 and symbolic names", () => {
  assert.equal(classifyError("Error code 2152398878"), "unknown-host");
  assert.equal(classifyError("NS_ERROR_UNKNOWN_HOST"), "unknown-host");
  assert.equal(classifyError("Error code 2152398850"), "aborted");
  assert.equal(classifyError("NS_BINDING_ABORTED"), "aborted");
  assert.equal(classifyError("Error code 2152398861"), "other"); // connection refused
  assert.equal(classifyError(undefined), "missing");
  assert.equal(classifyError(""), "missing");
});

test("shouldInvestigate: main frame unknown-host (or missing error) only", () => {
  assert.equal(shouldInvestigate({ frameId: 0, error: "Error code 2152398878" }), true);
  assert.equal(shouldInvestigate({ frameId: 0, error: undefined }), true);
  assert.equal(shouldInvestigate({ frameId: 0, error: "Error code 2152398850" }), false);
  assert.equal(shouldInvestigate({ frameId: 0, error: "Error code 2152398861" }), false);
  assert.equal(shouldInvestigate({ frameId: 25769803777, error: "Error code 2152398878" }), false);
});

test("decide: unknown host while DNS works → redirect", () => {
  assert.deepEqual(decide({ host: UNKNOWN, canary: OK, online: true }), {
    redirect: true,
    reason: "unknown-host",
  });
});

test("decide: null answer passed through → redirect even without canary", () => {
  const r = decide({ host: { addresses: ["0.0.0.0", "::"] }, canary: UNKNOWN, online: true });
  assert.equal(r.redirect, true);
});

test("decide: no redirect when offline, DNS broken, or the host resolves", () => {
  assert.equal(decide({ host: UNKNOWN, canary: OK, online: false }).redirect, false);
  assert.equal(decide({ host: UNKNOWN, canary: UNKNOWN, online: true }).redirect, false);
  assert.equal(decide({ host: UNKNOWN, canary: { rejected: "NS_ERROR_OFFLINE" }, online: true }).redirect, false);
  assert.equal(decide({ host: UNKNOWN, canary: { addresses: ["0.0.0.0"] }, online: true }).redirect, false);
  assert.equal(decide({ host: OK, canary: OK, online: true }).redirect, false);
  assert.equal(decide({ host: { rejected: "NS_ERROR_OFFLINE" }, canary: OK, online: true }).redirect, false);
});
