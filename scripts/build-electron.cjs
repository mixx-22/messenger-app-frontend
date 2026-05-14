const { spawnSync } = require("node:child_process");
const path = require("node:path");

const viteCli = path.join(__dirname, "..", "node_modules", "vite", "bin", "vite.js");

const result = spawnSync(process.execPath, [viteCli, "build"], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    ELECTRON_BUILD: "1",
  },
});

process.exit(result.status ?? 1);
