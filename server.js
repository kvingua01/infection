import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Game } from "./shared/game.js";
const app = express(),
  server = createServer(app),
  io = new Server(server, { maxHttpBufferSize: 4096 });
app.disable("x-powered-by");
app.use(express.static("public"));
app.use("/shared", express.static("shared"));
app.use("/vendor", express.static("node_modules/three/build"));
app.get("/health", (_, res) =>
  res.json({ ok: true, players: game.players.size, phase: game.phase }),
);
const game = new Game();
io.on("connection", (socket) => {
  let joined = false,
    budget = 0;
  const reset = setInterval(() => (budget = 0), 1000);
  socket.onAny(() => {
    if (++budget > 90) socket.disconnect(true);
  });
  socket.on("join", (name, ack) => {
    if (joined) return;
    if (game.players.size >= 32)
      return typeof ack === "function" && ack({ error: "Server is full" });
    joined = true;
    game.join(socket.id, name);
    if (typeof ack === "function") ack({ id: socket.id });
  });
  socket.on("input", (data) => game.input(socket.id, data));
  socket.on("throw", (d) => game.throw(socket.id, d));
  socket.on("use", (slot) => game.use(socket.id, slot));
  socket.on("disconnect", () => {
    clearInterval(reset);
    game.leave(socket.id);
  });
});
let lastTick = performance.now(),
  accumulator = 0;
setInterval(() => {
  const now = performance.now();
  accumulator += Math.min((now - lastTick) / 1000, 0.5);
  lastTick = now;
  while (accumulator >= 1 / 30) {
    game.tick(1 / 30);
    accumulator -= 1 / 30;
  }
}, 1000 / 60);
setInterval(() => {
  for (const id of game.players.keys())
    io.to(id).emit("state", game.snapshot(id));
}, 50);
server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("Infection listening on", server.address().port),
);
