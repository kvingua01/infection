import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { Lobbies } from "./shared/lobbies.js";
export function createGameServer({ lobbies = new Lobbies() } = {}) {
  const app = express(),
    server = createServer(app),
    io = new Server(server, { maxHttpBufferSize: 4096 });
  app.disable("x-powered-by");
  app.use(express.static("public"));
  app.use("/shared", express.static("shared"));
  app.use("/vendor", express.static("node_modules/three/build"));
  app.get("/health", (_, res) =>
    res.json({
      ok: true,
      players: lobbies.membership.size,
      lobbies: lobbies.rooms.size,
    }),
  );
  const key = (room) => "lobby:" + room.id;
  const update = () => {
    io.to("directory").emit("lobbies", lobbies.publicList());
    for (const room of lobbies.rooms.values())
      io.to(key(room)).emit("lobby", lobbies.describe(room));
  };
  const leave = (socket) => {
    const room = lobbies.leave(socket.id);
    if (room) socket.leave(key(room));
    update();
  };
  const attempts = new Map(),
    sessions = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of attempts)
      if (now - entry.since > 60000) attempts.delete(ip);
  }, 60000);
  io.on("connection", (socket) => {
    const session = socket.handshake.auth?.sessionId;
    if (typeof session === "string" && /^[a-f0-9-]{36}$/i.test(session)) {
      const previous = io.sockets.sockets.get(sessions.get(session));
      if (previous) {
        previous.emit("sessionReplaced");
        previous.disconnect(true);
      }
      sessions.set(session, socket.id);
    }
    socket.join("directory");
    socket.emit("lobbies", lobbies.publicList());
    let budget = 0,
      lobbyBudget = 0;
    const reset = setInterval(() => (budget = 0), 1000),
      resetLobbies = setInterval(() => (lobbyBudget = 0), 10000);
    socket.onAny(() => {
      if (++budget > 90) socket.disconnect(true);
    });
    const action = (event, operation) =>
      socket.on(event, (data, ack) => {
        if (!socket.connected) return;
        if (typeof data === "function") {
          ack = data;
          data = {};
        }
        const respond = typeof ack === "function" ? ack : () => {};
        try {
          if (++lobbyBudget > 8)
            throw Error("Too many lobby requests. Wait a few seconds.");
          if (["createLobby", "joinPublic", "joinPrivate"].includes(event)) {
            const ip = socket.handshake.address,
              now = Date.now();
            let entry = attempts.get(ip);
            if (!entry || now - entry.since > 60000) {
              entry = { since: now, joins: 0, creates: 0 };
              attempts.set(ip, entry);
            }
            if (
              ++entry.joins > 60 ||
              (event === "createLobby" && ++entry.creates > 10)
            )
              throw Error("Too many lobby attempts. Please wait a minute.");
          }
          const room = operation(data || {});
          if (room) {
            socket.join(key(room));
            respond({ id: socket.id, lobby: lobbies.describe(room) });
          } else respond({ ok: true });
          update();
        } catch (error) {
          respond({ error: error.message });
        }
      });
    action("createLobby", (data) => lobbies.create(socket.id, data));
    action("joinPublic", (data) => lobbies.joinPublic(socket.id, data));
    action("joinPrivate", (data) => lobbies.joinPrivate(socket.id, data));
    action("leaveLobby", () => {
      leave(socket);
      return null;
    });
    action("startGame", () => lobbies.start(socket.id));
    socket.on("input", (data) =>
      lobbies.roomFor(socket.id)?.game.input(socket.id, data),
    );
    socket.on("throw", (data) =>
      lobbies.roomFor(socket.id)?.game.throw(socket.id, data),
    );
    socket.on("use", (slot) =>
      lobbies.roomFor(socket.id)?.game.use(socket.id, slot),
    );
    socket.on("disconnect", () => {
      clearInterval(reset);
      clearInterval(resetLobbies);
      if (sessions.get(session) === socket.id) sessions.delete(session);
      leave(socket);
    });
  });
  let last = performance.now(),
    accumulator = 0;
  const physics = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min((now - last) / 1000, 0.5);
    last = now;
    let changed = false;
    while (accumulator >= 1 / 30) {
      changed = lobbies.tick(1 / 30) || changed;
      accumulator -= 1 / 30;
    }
    if (changed) update();
  }, 1000 / 60);
  const snapshots = setInterval(() => {
    for (const room of lobbies.rooms.values())
      for (const id of room.game.players.keys())
        io.to(id).emit("state", room.game.snapshot(id));
  }, 50);
  server.on("close", () => {
    clearInterval(physics);
    clearInterval(snapshots);
    clearInterval(cleanup);
  });
  return { app, server, io, lobbies };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createGameServer();
  server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log("Infection listening on", server.address().port),
  );
}
