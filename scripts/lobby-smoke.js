import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import assert from "node:assert/strict";
import { createGameServer } from "../server.js";
const { server, io: hub, lobbies } = createGameServer();
const clients = [];
const ask = (s, event, data = {}) =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, data, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
  );
const wait = (s, event, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Timed out: " + event)), 5000);
    const fn = (data) => {
      if (predicate(data)) {
        clearTimeout(timer);
        s.off(event, fn);
        resolve(data);
      }
    };
    s.on(event, fn);
  });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port;
async function connect(auth = {}) {
  const s = io(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth,
  });
  clients.push(s);
  await new Promise((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
try {
  const a = await connect(),
    b = await connect(),
    c = await connect(),
    d = await connect();
  const list = wait(d, "lobbies", (list) => list.length === 1);
  const pub = (
    await ask(a, "createLobby", {
      nickname: "Host A",
      name: "Open room",
      visibility: "public",
    })
  ).lobby;
  assert(pub);
  assert.equal((await list)[0].id, pub.id);
  const secret = (
    await ask(c, "createLobby", { nickname: "Host C", visibility: "private" })
  ).lobby;
  assert.match(secret.code, /^[A-Z0-9]{6}$/);
  assert(
    (await ask(d, "joinPrivate", { nickname: "D", code: "!!!!!!" })).error,
  );
  assert(
    (await ask(d, "joinPublic", { nickname: "D", lobbyId: secret.id })).error,
  );
  assert((await ask(a, "startGame")).error);
  await ask(b, "joinPublic", { nickname: "B", lobbyId: pub.id });
  await ask(d, "joinPrivate", {
    nickname: "D",
    code: secret.code.toLowerCase(),
  });
  assert((await ask(b, "startGame")).error);
  await ask(a, "startGame");
  await ask(c, "startGame");
  const sa = await wait(a, "state", (s) => s.phase === "hiding"),
    sc = await wait(c, "state", (s) => s.phase === "hiding");
  assert(sa.players.every((p) => [a.id, b.id].includes(p.id)));
  assert(sc.players.every((p) => [c.id, d.id].includes(p.id)));
  assert.equal(lobbies.publicList().length, 1);
  assert(!JSON.stringify(lobbies.publicList()).includes(secret.code));
  assert(
    (await ask(b, "joinPrivate", { nickname: "B", code: secret.code })).error,
  );
  const extra = await connect();
  await ask(extra, "joinPublic", { nickname: "Late", lobbyId: pub.id });
  const se = await wait(extra, "state");
  assert.equal(se.players.find((p) => p.id === extra.id).role, "waiting");
  const transfer = wait(b, "lobby", (r) => r.hostId === b.id);
  a.disconnect();
  await transfer;
  await ask(b, "leaveLobby");
  await ask(extra, "leaveLobby");
  assert(!lobbies.rooms.has(pub.id));
  await ask(d, "leaveLobby");
  await ask(c, "leaveLobby");
  assert.equal(lobbies.rooms.size, 0);
  const full = (
    await ask(b, "createLobby", {
      nickname: "Capacity host",
      visibility: "public",
    })
  ).lobby;
  const fillers = [];
  for (let i = 0; i < 11; i++) {
    const member = await connect();
    fillers.push(member);
    await ask(member, "joinPublic", {
      nickname: "Member " + i,
      lobbyId: full.id,
    });
  }
  assert.equal(
    lobbies.publicList().find((r) => r.id === full.id).status,
    "full",
  );
  assert.match(
    (await ask(d, "joinPublic", { nickname: "Overflow", lobbyId: full.id }))
      .error,
    /full/,
  );
  assert.match(
    (await ask(fillers[0], "startGame", { hostId: b.id })).error,
    /host/,
  );
  for (const member of fillers) member.disconnect();
  await ask(b, "leaveLobby");
  const sessionId = randomUUID(),
    old = await connect({ sessionId });
  const refreshRoom = (
    await ask(old, "createLobby", {
      nickname: "Refresh host",
      visibility: "public",
    })
  ).lobby;
  await ask(d, "joinPublic", {
    nickname: "Refresh friend",
    lobbyId: refreshRoom.id,
  });
  await ask(old, "startGame");
  const oldId = old.id,
    replacement = await connect({ sessionId });
  assert(!lobbies.membership.has(oldId));
  assert.equal(lobbies.rooms.get(refreshRoom.id).hostId, d.id);
  await ask(replacement, "joinPublic", {
    nickname: "Returned",
    lobbyId: refreshRoom.id,
  });
  assert.equal(
    lobbies.roomFor(replacement.id).game.players.get(replacement.id).role,
    "waiting",
  );
  console.log(
    "PASS: public/private creation and joins, live listing, private-code validation/privacy, host-only start, independent running games, late arrival, duplicate membership rejection, host transfer, full-room rejection, stale-session replacement, refresh waiting, leave and empty cleanup.",
  );
} finally {
  for (const c of clients) c.disconnect();
  await new Promise((resolve) => hub.close(resolve));
}
