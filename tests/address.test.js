"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/address.js");
const { isNullAddress, isBlockedAnswer } = globalThis.SF_ADDRESS;

test("null addresses", () => {
  for (const a of ["0.0.0.0", "::", "0:0:0:0:0:0:0:0", "::0", "0::", "::ffff:0.0.0.0", "::%eth0"]) {
    assert.equal(isNullAddress(a), true, a);
  }
});

test("real and unrelated addresses are not null", () => {
  for (const a of [
    "93.184.215.14",
    "127.0.0.1",
    "0.0.0.1",
    "::1",
    "fe80::1",
    "2606:4700::6810:84e5",
    "::ffff:1.2.3.4",
    "1::",
    "",
    null,
    "not an ip",
    ":::",
  ]) {
    assert.equal(isNullAddress(a), false, String(a));
  }
});

test("blocked only when every address is null and there is at least one", () => {
  assert.equal(isBlockedAnswer(["0.0.0.0", "::"]), true);
  assert.equal(isBlockedAnswer(["::", "0.0.0.0"]), true);
  assert.equal(isBlockedAnswer(["0.0.0.0"]), true);
  assert.equal(isBlockedAnswer(["0.0.0.0", "93.184.215.14"]), false);
  assert.equal(isBlockedAnswer([]), false);
  assert.equal(isBlockedAnswer(undefined), false);
});
