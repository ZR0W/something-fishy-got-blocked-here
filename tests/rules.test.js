"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/config.js");
require("../src/common/rules.js");
const { normalizeConfig, DEFAULT_CONFIG } = globalThis.SF_CONFIG;
const { hostMatches, findRule, inWindow, pickMessage, renderTemplate } = globalThis.SF_RULES;

const at = (hh, mm = 0) => new Date(2026, 9, 21, hh, mm);

test("hostname pattern forms", () => {
  assert.equal(hostMatches("example.com", "example.com"), true);
  assert.equal(hostMatches("example.com", "a.b.example.com"), true);
  assert.equal(hostMatches("example.com", "badexample.com"), false);
  assert.equal(hostMatches("=example.com", "example.com"), true);
  assert.equal(hostMatches("=example.com", "www.example.com"), false);
  assert.equal(hostMatches("*.example.com", "www.example.com"), true);
  assert.equal(hostMatches("*.example.com", "example.com"), false);
  assert.equal(hostMatches("*.example.com", "notexample.com"), false);
});

test("first enabled matching rule wins; path is a prefix", () => {
  const rules = [
    { pattern: "reddit.com", path: "/r/news", enabled: true, messages: [] },
    { pattern: "off.com", path: "", enabled: false, messages: [] },
    { pattern: "reddit.com", path: "", enabled: true, messages: [] },
  ];
  assert.equal(findRule(rules, "https://www.reddit.com/r/news/comments/1"), 0);
  assert.equal(findRule(rules, "https://www.reddit.com/r/aww"), 2);
  assert.equal(findRule(rules, "https://off.com/"), -1);
  assert.equal(findRule(rules, "https://example.org/"), -1);
  assert.equal(findRule(rules, "garbage"), -1);
});

test("time windows, including wrap past midnight", () => {
  assert.equal(inWindow("23:00", "05:00", at(23, 30)), true);
  assert.equal(inWindow("23:00", "05:00", at(2)), true);
  assert.equal(inWindow("23:00", "05:00", at(5)), false);
  assert.equal(inWindow("23:00", "05:00", at(12)), false);
  assert.equal(inWindow("09:00", "17:00", at(9)), true);
  assert.equal(inWindow("09:00", "17:00", at(17)), false);
  assert.equal(inWindow("00:00", "00:00", at(13)), true);
});

test("pickMessage: default messages by time of day", () => {
  const cfg = normalizeConfig(DEFAULT_CONFIG);
  assert.match(pickMessage(cfg, "https://x.test/", at(2)).text, /late/);
  assert.match(pickMessage(cfg, "https://x.test/", at(7)).text, /morning/);
  assert.match(pickMessage(cfg, "https://x.test/", at(14)).text, /caught in the net/);
  assert.equal(pickMessage(cfg, "https://x.test/", at(14)).ruleIndex, -1);
});

test("pickMessage: rule message and title, falling back to defaults by time", () => {
  const cfg = normalizeConfig({
    defaults: { title: "D", messages: [{ text: "default" }] },
    rules: [
      { pattern: "a.test", title: "A", messages: [{ from: "09:00", to: "17:00", text: "work" }] },
    ],
  });
  assert.deepEqual(pickMessage(cfg, "https://www.a.test/", at(10)), {
    title: "A",
    text: "work",
    ruleIndex: 0,
  });
  assert.deepEqual(pickMessage(cfg, "https://www.a.test/", at(20)), {
    title: "A",
    text: "default",
    ruleIndex: 0,
  });
});

test("renderTemplate", () => {
  const vars = { host: "x.test", url: "https://x.test/", count: 3, time: "02:00" };
  assert.equal(renderTemplate("{host} #{count} at {time} {nope}", vars), "x.test #3 at 02:00 {nope}");
  assert.equal(renderTemplate("<b>{host}</b>", vars), "<b>x.test</b>");
});

test("normalizeConfig repairs bad input", () => {
  assert.deepEqual(normalizeConfig(null), structuredClone(DEFAULT_CONFIG));
  const cfg = normalizeConfig({
    showCount: false,
    defaults: { title: "  ", messages: [{ text: "" }, { from: "25:00", to: "01:00", text: "bad" }] },
    rules: [
      { pattern: "  Example.COM. ", path: "news", messages: [{ from: "22:00", text: "half" }] },
      { pattern: "not a domain!", messages: [{ text: "x" }] },
      { pattern: "*.bücher.example", enabled: false, messages: [{ text: "y" }] },
    ],
  });
  assert.equal(cfg.showCount, false);
  assert.equal(cfg.defaults.title, DEFAULT_CONFIG.defaults.title);
  assert.deepEqual(cfg.defaults.messages, DEFAULT_CONFIG.defaults.messages);
  assert.equal(cfg.rules.length, 2);
  assert.deepEqual(cfg.rules[0], {
    pattern: "example.com",
    path: "/news",
    enabled: true,
    title: "",
    messages: [],
  });
  assert.equal(cfg.rules[1].pattern, "*.xn--bcher-kva.example");
  assert.equal(cfg.rules[1].enabled, false);
  // An explicitly empty rule list stays empty (user deleted the shipped rule).
  assert.deepEqual(normalizeConfig({ rules: [] }).rules, []);
});
