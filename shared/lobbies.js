import { randomInt, randomUUID } from "node:crypto";
import { Game } from "./game.js";
export class Lobbies {
  constructor({ gameFactory = () => new Game({ autoStart: false }) } = {}) {
    this.rooms = new Map();
    this.membership = new Map();
    this.codes = new Map();
    this.gameFactory = gameFactory;
  }
  nickname(value) {
    if (typeof value !== "string" || !value.trim())
      throw Error("Enter a nickname first.");
    const clean = value
      .replace(/[<>\x00-\x1f]/g, "")
      .trim()
      .slice(0, 18);
    if (!clean) throw Error("Enter a nickname first.");
    return clean;
  }
  available(id) {
    if (this.membership.has(id)) throw Error("Leave your current lobby first.");
  }
  create(id, { nickname, name, visibility } = {}) {
    this.available(id);
    nickname = this.nickname(nickname);
    if (!["public", "private"].includes(visibility))
      throw Error("Invalid lobby type.");
    if (this.rooms.size >= 100)
      throw Error("Too many lobbies. Try again later.");
    let code = null;
    if (visibility === "private") {
      do {
        code = Array.from(
          { length: 6 },
          () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[randomInt(36)],
        ).join("");
      } while (this.codes.has(code));
    }
    const cleanName =
      typeof name === "string"
        ? name
            .replace(/[<>\x00-\x1f]/g, "")
            .trim()
            .slice(0, 32)
        : "";
    const room = {
      id: randomUUID(),
      name: cleanName || `${nickname}'s lobby`,
      visibility,
      code,
      hostId: id,
      game: this.gameFactory(),
      maxPlayers: 12,
    };
    this.rooms.set(room.id, room);
    if (code) this.codes.set(code, room.id);
    this.add(room, id, nickname);
    return room;
  }
  add(room, id, nickname) {
    this.available(id);
    if (room.game.players.size >= room.maxPlayers)
      throw Error("This lobby is full.");
    room.game.join(id, nickname);
    this.membership.set(id, room.id);
    return room;
  }
  joinPublic(id, { lobbyId, nickname } = {}) {
    this.available(id);
    nickname = this.nickname(nickname);
    const room = this.rooms.get(lobbyId);
    if (!room || room.visibility !== "public")
      throw Error("Public lobby no longer available.");
    return this.add(room, id, nickname);
  }
  joinPrivate(id, { code, nickname } = {}) {
    this.available(id);
    nickname = this.nickname(nickname);
    if (typeof code !== "string" || !/^[A-Z0-9]{6}$/i.test(code.trim()))
      throw Error("Enter a valid 6-character code.");
    const room = this.rooms.get(this.codes.get(code.trim().toUpperCase()));
    if (!room) throw Error("Invalid or expired lobby code.");
    return this.add(room, id, nickname);
  }
  roomFor(id) {
    return this.rooms.get(this.membership.get(id));
  }
  leave(id) {
    const room = this.roomFor(id);
    if (!room) return null;
    this.membership.delete(id);
    room.game.leave(id);
    if (!room.game.players.size) {
      this.rooms.delete(room.id);
      if (room.code) this.codes.delete(room.code);
    } else if (room.hostId === id)
      room.hostId = room.game.players.keys().next().value;
    return room;
  }
  start(id) {
    const room = this.roomFor(id);
    if (!room) throw Error("Join a lobby first.");
    if (room.hostId !== id) throw Error("Only the host can start the game.");
    if (room.game.phase !== "lobby") throw Error("A game is already running.");
    if (room.game.players.size < 2)
      throw Error("At least 2 players are required.");
    room.game.start();
    room.game.autoStart = true;
    return room;
  }
  describe(room) {
    return {
      id: room.id,
      name: room.name,
      visibility: room.visibility,
      code: room.code,
      hostId: room.hostId,
      host: room.game.players.get(room.hostId)?.name,
      playerCount: room.game.players.size,
      maxPlayers: room.maxPlayers,
      phase: room.game.phase,
      status:
        room.game.players.size >= room.maxPlayers
          ? "full"
          : room.game.phase === "lobby"
            ? "waiting"
            : "playing",
      players: [...room.game.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
      })),
    };
  }
  publicList() {
    return [...this.rooms.values()]
      .filter((r) => r.visibility === "public")
      .map((r) => {
        const { code, players, ...summary } = this.describe(r);
        return summary;
      });
  }
  tick(dt) {
    let changed = false;
    for (const room of this.rooms.values()) {
      const before = room.game.phase;
      room.game.tick(dt);
      if (before !== room.game.phase) changed = true;
    }
    return changed;
  }
}
