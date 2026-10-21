"use strict";

const out = document.getElementById("out");
const status = document.getElementById("status");

async function refresh() {
  const { diagLog = [] } = await browser.storage.local.get("diagLog");
  out.textContent = JSON.stringify(diagLog, null, 2);
  status.textContent = `${diagLog.length} entries`;
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("clear").addEventListener("click", async () => {
  await browser.storage.local.remove("diagLog");
  refresh();
});
document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(out.textContent);
  status.textContent = "copied";
});
refresh();
