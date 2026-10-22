"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/attempts.js");
const { recordAttempt, MAX_HOSTS } = globalThis.SF_ATTEMPTS;

test("counts per host and keeps first/last", () => {
  let m = recordAttempt(undefined, "a.test", "2026-10-22T10:00:00Z");
  m = recordAttempt(m, "a.test", "2026-10-22T11:00:00Z");
  m = recordAttempt(m, "b.test", "2026-10-22T12:00:00Z");
  assert.deepEqual(m["a.test"], { count: 2, first: "2026-10-22T10:00:00Z", last: "2026-10-22T11:00:00Z" });
  assert.equal(m["b.test"].count, 1);
});

test("does not mutate the input", () => {
  const m = { "a.test": { count: 1, first: "x", last: "x" } };
  recordAttempt(m, "a.test", "y");
  assert.equal(m["a.test"].count, 1);
});

test("drops the least recently seen hosts beyond the cap", () => {
  let m = {};
  for (let i = 0; i < MAX_HOSTS + 2; i++) {
    m = recordAttempt(m, `h${i}.test`, new Date(Date.UTC(2026, 9, 22) + i * 1000).toISOString());
  }
  assert.equal(Object.keys(m).length, MAX_HOSTS);
  assert.equal(m["h0.test"], undefined);
  assert.equal(m["h1.test"], undefined);
  assert.ok(m[`h${MAX_HOSTS + 1}.test`]);
});
