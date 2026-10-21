"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../src/common/url.js");
const { candidateHost } = globalThis.SF_URL;

test("extracts the hostname from http(s) URLs", () => {
  assert.equal(candidateHost("https://ad.doubleclick.net/x?y=1#z"), "ad.doubleclick.net");
  assert.equal(candidateHost("http://Example.COM./"), "example.com");
  assert.equal(candidateHost("https://user:pw@sub.example.com:8443/p"), "sub.example.com");
  assert.equal(candidateHost("https://bücher.example/"), "xn--bcher-kva.example");
});

test("ignores non-web schemes, IP literals, localhost, junk", () => {
  for (const u of [
    "about:neterror?e=dnsNotFound",
    "about:blank",
    "moz-extension://1234/src/blocked/blocked.html?url=x",
    "file:///C:/Users/x.html",
    "data:text/html,hi",
    "view-source:https://example.com/",
    "ftp://example.com/",
    "http://0.0.0.0/",
    "http://198.51.100.7/admin",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://0x7f.1/",
    "http://localhost:3000/",
    "http://app.localhost/",
    "not a url",
    "",
  ]) {
    assert.equal(candidateHost(u), null, u);
  }
});
