import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(process.execPath, ["server.js"], {
  cwd,
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stderr.on("data", (data) => (logs += data));
try {
  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error("Startup timed out: " + logs)),
      15000,
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Server exited " + code + ": " + logs));
    });
    child.stdout.on("data", (data) => {
      output += data;
      const match = output.match(/Infection listening on (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
  });
  const base = "http://127.0.0.1:" + port;
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  for (const path of [
    "/",
    "/client.js",
    "/vendor/three.module.js",
    "/shared/maps.js",
    "/socket.io/socket.io.js",
  ])
    assert.equal((await fetch(base + path)).status, 200, path);
  console.log(
    "PASS: PORT override, startup, health check, frontend, Three.js and same-service Socket.IO assets.",
  );
} finally {
  child.kill("SIGTERM");
}
