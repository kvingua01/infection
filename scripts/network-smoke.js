// Start npm start first. Uses twelve separate, genuine Socket.IO connections.
import { io } from "socket.io-client";
import assert from "node:assert/strict";
const url = process.argv[2] || "http://127.0.0.1:3000",
  clients = [];
const wait = (socket, predicate, timeout = 35000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("state", onState);
      reject(new Error("Timed out waiting for authoritative state"));
    }, timeout);
    function onState(s) {
      if (predicate(s)) {
        clearTimeout(timer);
        socket.off("state", onState);
        resolve(s);
      }
    }
    socket.on("state", onState);
  });
async function join(name) {
  const socket = io(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  await new Promise((resolve) => socket.emit("join", name, resolve));
  return socket;
}
try {
  const a = await join("Smoke A"),
    b = await join("Smoke B");
  const s = await wait(a, (s) => s.phase === "hiding");
  assert.equal(s.counts.seekers, 1);
  assert.equal(s.counts.hiders, 1);
  const seeker =
      s.players.find((p) => p.id === a.id)?.role === "seeker" ? a : b,
    hider = seeker === a ? b : a;
  const locked = await wait(seeker, (s) => s.phase === "hiding");
  assert.equal(locked.players.length, 1);
  assert.equal(locked.players[0].x, 45);
  seeker.emit("throw", { x: 0, y: 0, z: 1 });
  assert.equal((await wait(seeker, () => true)).projectiles.length, 0);
  const late = await join("Late arrival");
  const l = await wait(late, () => true);
  assert.equal(l.players.find((p) => p.id === late.id).role, "waiting");
  for (let n = 3; n < 12; n++) await join("Load " + n);
  const roster = await wait(late, () => true);
  assert.equal(roster.scoreboard.length, 12);
  const release = await wait(seeker, (s) => s.phase === "playing");
  assert(release.remaining > 298 && release.remaining <= 300);
  assert.equal(release.players.filter((p) => p.role === "seeker").length, 1);
  assert.notEqual(release.players.find((p) => p.id === seeker.id).x, 45);
  console.log(
    "PASS: twelve independent clients, one seeker, isolation privacy, blocked early throws, late arrival, 30-second release and 5-minute timer.",
  );
} finally {
  for (const c of clients) c.disconnect();
}
