const { spawn } = require("node:child_process");
const http = require("node:http");

const isWindows = process.platform === "win32";
const npx = isWindows ? "npx.cmd" : "npx";
const rendererUrl = "http://127.0.0.1:5173";

let vite;
let electron;
let shuttingDown = false;

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

function waitForRenderer(attempts = 120) {
  return new Promise((resolve, reject) => {
    const tryOnce = (remaining) => {
      const req = http.get(rendererUrl, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (remaining <= 0) {
          reject(new Error(`Vite did not start at ${rendererUrl}`));
          return;
        }
        setTimeout(() => tryOnce(remaining - 1), 500);
      });

      req.setTimeout(1000, () => {
        req.destroy();
      });
    };

    tryOnce(attempts);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

vite = spawnProcess(npx, [
  "vite",
  "--host",
  "127.0.0.1",
  "--port",
  "5173",
  "--strictPort",
]);

vite.on("exit", (code) => {
  if (!shuttingDown) shutdown(code || 0);
});

waitForRenderer()
  .then(() => {
    electron = spawnProcess(npx, ["electron", "."], {
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: rendererUrl,
      },
    });

    electron.on("exit", (code) => shutdown(code || 0));
  })
  .catch((err) => {
    console.error(err.message);
    shutdown(1);
  });
