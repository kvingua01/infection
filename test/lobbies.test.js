import test from "node:test";
import assert from "node:assert/strict";
import { Lobbies } from "../shared/lobbies.js";
const make = (m, id = "host", visibility = "public") =>
  m.create(id, { nickname: id, name: "Friends", visibility });
test("public and private listings, random codes and private access control", () => {
  const m = new Lobbies(),
    pub = make(m),
    priv = make(m, "secret", "private");
  assert.match(priv.code, /^[A-Z0-9]{6}$/);
  assert.notEqual(pub.id, priv.id);
  assert.equal(m.publicList().length, 1);
  assert(!JSON.stringify(m.publicList()).includes(priv.code));
  assert.throws(() =>
    m.joinPublic("intruder", { lobbyId: priv.id, nickname: "No" }),
  );
  assert.throws(() => m.joinPrivate("bad", { code: "BAD999", nickname: "No" }));
  m.joinPrivate("friend", {
    code: priv.code.toLowerCase(),
    nickname: "Friend",
  });
  assert.equal(m.roomFor("friend").id, priv.id);
});
test("host start requires two players, waiting is manual, duplicate start rejected", () => {
  const m = new Lobbies(),
    r = make(m);
  assert.throws(() => m.start("host"), /2 players/);
  m.joinPublic("other", { lobbyId: r.id, nickname: "Other" });
  m.tick(1 / 30);
  assert.equal(r.game.phase, "lobby");
  assert.throws(() => m.start("other"), /host/);
  m.start("host");
  assert.equal(r.game.phase, "hiding");
  assert.throws(() => m.start("host"), /already/);
  m.joinPublic("late", { lobbyId: r.id, nickname: "Late" });
  assert.equal(r.game.players.get("late").role, "waiting");
});
test("twelve-player capacity, one room per connection, host transfer and empty cleanup", () => {
  const m = new Lobbies(),
    r = make(m, "host", "private");
  for (let i = 1; i < 12; i++)
    m.joinPrivate("p" + i, { code: r.code, nickname: "P" + i });
  assert.equal(m.describe(r).status, "full");
  assert.throws(
    () => m.joinPrivate("extra", { code: r.code, nickname: "Extra" }),
    /full/,
  );
  assert.throws(() => make(m, "p1"), /Leave/);
  m.leave("host");
  assert.equal(r.hostId, "p1");
  m.start("p1");
  for (let i = 1; i < 12; i++) m.leave("p" + i);
  assert.equal(m.rooms.size, 0);
  assert.equal(m.codes.size, 0);
  assert.equal(m.membership.size, 0);
  assert.throws(
    () => m.joinPrivate("again", { code: r.code, nickname: "Back" }),
    /expired/,
  );
});
test("games isolate positions, inventories, clocks, projectiles and scores", () => {
  const m = new Lobbies(),
    a = make(m, "a"),
    b = make(m, "b", "private");
  m.joinPublic("a2", { lobbyId: a.id, nickname: "A2" });
  m.joinPrivate("b2", { code: b.code, nickname: "B2" });
  m.start("a");
  m.start("b");
  assert.notEqual(a.game, b.game);
  a.game.players.get("a").inventory = ["shield"];
  a.game.players.get("a").score = 4;
  a.game.players.get("a").x = 20;
  a.game.time = 50;
  assert.equal(b.game.time, 0);
  assert(!b.game.snapshot("b").players.some((p) => p.id === "a"));
  assert.equal(b.game.players.get("b").score, 0);
  assert.deepEqual(b.game.players.get("b").inventory, []);
  assert.notEqual(a.game.projectiles, b.game.projectiles);
  assert.notEqual(a.game.pickups, b.game.pickups);
});
test("nickname and visibility validation and private codes are unique", () => {
  const m = new Lobbies();
  assert.throws(
    () => m.create("x", { nickname: " ", visibility: "public" }),
    /nickname/,
  );
  assert.throws(
    () => m.create("x", { nickname: "X", visibility: "secret" }),
    /type/,
  );
  const codes = new Set();
  for (let i = 0; i < 20; i++) codes.add(make(m, "p" + i, "private").code);
  assert.equal(codes.size, 20);
});
