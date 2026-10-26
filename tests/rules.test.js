"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/config.js");
require("../src/common/rules.js");
const { normalizeConfig, DEFAULT_CONFIG, messageProblem } = globalThis.SF_CONFIG;
const { hostMatches, findRule, inWindow, chooseEntry, pickEntry, entryAt, renderTemplate, renderUrl } =
  globalThis.SF_RULES;

// Deterministic "random": always picks the first / last of the pool.
const first = () => 0;
const last = () => 0.999999;

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

test("pickEntry: default entries by time of day", () => {
  const cfg = normalizeConfig(DEFAULT_CONFIG);
  assert.match(pickEntry(cfg, "https://x.test/", at(2), last).entry.text, /late/);
  assert.match(pickEntry(cfg, "https://x.test/", at(7), last).entry.text, /morning/);
  assert.match(pickEntry(cfg, "https://x.test/", at(14), last).entry.text, /caught in the net/);
  assert.equal(pickEntry(cfg, "https://x.test/", at(14)).ruleIndex, -1);
});

test("pickEntry: rule entry and title, falling back to defaults by time", () => {
  const cfg = normalizeConfig({
    defaults: { title: "D", messages: [{ text: "default" }] },
    rules: [
      { pattern: "a.test", title: "A", messages: [{ from: "09:00", to: "17:00", text: "work" }] },
    ],
  });
  assert.deepEqual(pickEntry(cfg, "https://www.a.test/", at(10)), {
    title: "A",
    entry: { from: "09:00", to: "17:00", text: "work" },
    ruleIndex: 0,
    entryIndex: 0,
  });
  assert.deepEqual(pickEntry(cfg, "https://www.a.test/", at(20)), {
    title: "A",
    entry: { text: "default" },
    ruleIndex: -1,
    entryIndex: 0,
  });
  assert.deepEqual(entryAt(cfg, 0, 0), { from: "09:00", to: "17:00", text: "work" });
  assert.equal(entryAt(cfg, 5, 0), null);
});

test("chooseEntry: random among fitting entries; timed ones take precedence", () => {
  const entries = [
    { text: "a" },
    { show: "page", url: "https://todo.example/" },
    { from: "23:00", to: "05:00", text: "night" },
    { from: "23:00", to: "05:00", show: "close" },
  ];
  assert.equal(chooseEntry(entries, at(12), first), 0);
  assert.equal(chooseEntry(entries, at(12), last), 1);
  assert.equal(chooseEntry(entries, at(2), first), 2);
  assert.equal(chooseEntry(entries, at(2), last), 3);
  const counts = [0, 0];
  for (let i = 0; i < 1000; i++) counts[chooseEntry(entries, at(12), Math.random)]++;
  assert.ok(counts[0] > 350 && counts[1] > 350, `roughly even: ${counts}`);
  // The message page only renders messages: filter by kind.
  const onlyMessages = (m) => (m.show ?? "message") === "message";
  assert.equal(chooseEntry(entries, at(2), last, onlyMessages), 2);
  assert.equal(chooseEntry([{ show: "close" }], at(2), first, onlyMessages), -1);
});

test("renderUrl: placeholders are URL-encoded; LeechBlock $U works; only http(s)", () => {
  const vars = { url: "https://x.test/a?b=1&c=2", host: "x.test", count: 3, time: "02:00" };
  assert.equal(
    renderUrl("https://todo.example/?from={host}&n={count}", vars),
    "https://todo.example/?from=x.test&n=3"
  );
  assert.equal(
    renderUrl("https://todo.example/?u=$U", vars),
    "https://todo.example/?u=https%3A%2F%2Fx.test%2Fa%3Fb%3D1%26c%3D2"
  );
  assert.equal(renderUrl("https://todo.example/", vars), "https://todo.example/");
  assert.equal(renderUrl("file:///C:/notes.html", vars), null);
  assert.equal(renderUrl("javascript:alert(1)", vars), null);
  assert.equal(renderUrl("todo.example", vars), null);
  assert.equal(renderUrl("", vars), null);
});

test("entry validation and cleanup per kind", () => {
  assert.equal(messageProblem({ text: "hi" }), "");
  assert.equal(messageProblem({ show: "page", url: "https://todo.example/?u=$U" }), "");
  assert.match(messageProblem({ show: "page", url: "todo.example" }), /http/);
  assert.equal(messageProblem({ show: "blank" }), "");
  assert.equal(messageProblem({ show: "close", from: "22:00", to: "06:00" }), "");
  assert.match(messageProblem({ show: "teleport" }), /unknown kind/);
  const cfg = normalizeConfig({
    defaults: {
      messages: [
        { show: "message", text: "hi", url: "ignored" },
        { show: "page", url: " https://todo.example/ ", text: "ignored" },
        { show: "blank", from: "22:00", to: "06:00" },
      ],
    },
  });
  assert.deepEqual(cfg.defaults.messages, [
    { text: "hi" },
    { show: "page", url: "https://todo.example/" },
    { show: "blank", from: "22:00", to: "06:00" },
  ]);
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
