// web-ext settings for `npm run start|lint|build|sign`. Only manifest.json, src/
// and icons/ belong in the packaged extension; everything listed here is dev-only.
// AMO credentials are NOT configured here: web-ext reads WEB_EXT_API_KEY and
// WEB_EXT_API_SECRET from the environment (see README "Signing").
module.exports = {
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "web-ext-config.cjs",
    "*.md",
    "docs",
    "scripts",
    "tests",
    "tools",
  ],
  run: {
    startUrl: ["about:debugging#/runtime/this-firefox"],
    // Fresh web-ext profiles get Firefox's default DoH setting, which could bypass
    // Pi-hole. 5 = DoH off by choice (matches the owner's real profile).
    pref: ["network.trr.mode=5"],
  },
};
