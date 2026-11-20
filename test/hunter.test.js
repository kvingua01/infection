import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../shared/game.js";

function setup(options = { hunterSpawnChance: 0 }) {
  const game = new Game({ random: () => 0.4, hide: 0, ...options });
  for (const id of ["a", "b", "c", "d"]) game.join(id, id);
  game.tick(0);
  const seeker = game.active().find((p) => p.role === "seeker");
  const hiders = game.active().filter((p) => p.role === "hider");
  return { game, seeker, hiders };
}

test("hunter spawn rolls default to one in eight, have equal types, and stop at one cube", () => {
  const { game } = setup({});
  for (const player of game.active()) Object.assign(player, { x: 30, z: 30 });
  for (let i = 0; i < 8; i++) {
    game.random = () => 0.124 + i / 8;
    game.spawnAt = game.time;
    game.tick(0);
    assert.equal(game.pickups.length, i + 2);
    assert.equal(!!game.hunterPickup, i === 0);
    game.hunterPickup = null;
  }
  for (const [roll, type] of [[0.16, "vision"], [0.5, "disruptor"], [0.84, "nullifier"]]) {
    const draws = [0.4, 0.4, 0.12, 0.4, roll];
    game.random = () => draws.shift();
    game.spawnAt = game.time;
    game.tick(0);
    assert.equal(game.hunterPickup.type, type);
    const existing = game.hunterPickup;
    game.random = () => 0.01;
    game.spawnAt = game.time;
    game.tick(0);
    assert.equal(game.hunterPickup, existing);
    game.hunterPickup = null;
  }
});

test("hunter pickup validates distance, role, capacity and round end", () => {
  const { game, seeker, hiders: [hider, converted] } = setup();
  const position = game.map.release;
  Object.assign(seeker, position, { y: position.y + 4 });
  Object.assign(hider, position);
  game.hunterPickup = { ...position, type: "vision" };
  game.tick(0);
  assert.equal(seeker.hunterItem, null);
  assert.equal(hider.hunterItem, null);
  assert.equal(game.use(hider.id, 0), false);
  Object.assign(seeker, position);
  game.tick(0);
  assert.equal(seeker.hunterItem, "vision");
  assert.equal(game.visionUntil, 0);
  assert.equal(game.hunterPickup, null);
  game.hunterPickup = { ...position, type: "disruptor" };
  game.tick(0);
  assert.equal(seeker.hunterItem, "vision");
  assert.ok(game.hunterPickup);
  game.convert(converted);
  Object.assign(converted, position);
  game.tick(0);
  assert.equal(converted.hunterItem, "disruptor");
  assert.equal(game.hunterPickup, null);
  game.end("HIDERS WIN");
  assert.equal(seeker.hunterItem, null);
  assert.equal(converted.hunterItem, null);
});

test("vision streams current positions of all hiders to seekers only for two seconds", () => {
  const { game, seeker, hiders: [hider, newSeeker, invisible] } = setup();
  const otherRoom = setup();
  game.convert(newSeeker);
  game.join("late", "Late");
  invisible.effects.invisibility = 30;
  assert(!game.snapshot(seeker.id).players.some((p) => p.id === invisible.id));
  seeker.hunterItem = "vision";
  assert.equal(game.use(seeker.id, { target: hider.id }), false);
  assert(game.use(seeker.id, 1));
  assert.equal(game.use(seeker.id, 0), false);
  const vision = () => game.snapshot(seeker.id).hunterVision;
  assert.equal(vision().until - game.time, 2);
  assert.equal(vision().targets.length, 2);
  assert.deepEqual(game.snapshot(newSeeker.id).hunterVision, vision());
  for (const id of [hider.id, invisible.id, "late", "unknown"])
    assert.equal(game.snapshot(id).hunterVision, undefined);
  assert.equal(otherRoom.game.snapshot(otherRoom.seeker.id).hunterVision, undefined);
  invisible.x += 1;
  assert(vision().targets.some((p) => p.x === invisible.x && p.z === invisible.z));
  game.time = 1.999;
  assert(vision());
  game.time = 2;
  assert.equal(vision(), undefined);
  assert(!game.snapshot(seeker.id).players.some((p) => p.id === invisible.id));
});

test("disruptor removes one unused item per hider and preserves active effects", () => {
  const { game, seeker, hiders: [two, one, empty] } = setup();
  const otherRoom = setup();
  otherRoom.hiders[0].inventory = ["speed"];
  game.random = () => 0.7;
  two.inventory = ["shield", "jump"];
  one.inventory = ["decoy"];
  two.effects.speed = 10;
  seeker.hunterItem = "disruptor";
  assert(game.use(seeker.id, 0));
  assert.deepEqual(two.inventory, ["shield"]);
  assert.deepEqual(one.inventory, []);
  assert.equal(two.effects.speed, 10);
  assert.deepEqual(otherRoom.hiders[0].inventory, ["speed"]);
  for (const hider of [two, one])
    assert.equal(game.snapshot(hider.id).players.find((p) => p.id === hider.id)
      .hunterNotice.text, "A hunter destroyed one of your power-ups!");
  assert.equal(empty.hunterNotice, null);
});

test("nullifier clears shields, expires or shortens buffs and preserves carried items", () => {
  const { game, seeker, hiders: [hider] } = setup();
  const otherRoom = setup();
  game.time = 50;
  hider.inventory = ["shield", "speed"];
  hider.effects = { shield: 100, invisibility: 75, speed: 62, jump: 70 };
  seeker.effects.freeze = 55;
  otherRoom.hiders[0].effects.shield = 100;
  seeker.hunterItem = "nullifier";
  assert(game.use(seeker.id, 0));
  assert.deepEqual(hider.effects, { invisibility: 60, jump: 55 });
  assert.deepEqual(hider.inventory, ["shield", "speed"]);
  assert.equal(seeker.effects.freeze, 55);
  assert.equal(otherRoom.hiders[0].effects.shield, 100);
  assert.equal(hider.hunterNotice.text, "A hunter weakened your active power-ups!");
});
