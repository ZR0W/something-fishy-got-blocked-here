// Used by `npm run diag` only.
module.exports = {
  ignoreFiles: ["web-ext-config.cjs", "README.md"],
  run: {
    // DoH off in the throwaway profile so DNS goes through Pi-hole (see ../../web-ext-config.cjs).
    pref: ["network.trr.mode=5"],
    startUrl: ["https://example.com/"],
  },
};
