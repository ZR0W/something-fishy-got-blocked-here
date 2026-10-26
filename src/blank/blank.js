// Shipped "blank page" destination: nothing on the page; the tab title names the
// blocked host so the tab is still identifiable.
"use strict";

try {
  const host = new URL(new URLSearchParams(location.search).get("url") ?? "").hostname;
  if (host) document.title = `Blocked: ${host}`;
} catch {
  // keep the default title
}
