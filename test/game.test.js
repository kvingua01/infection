import test from "node:test";
import assert from "node:assert/strict";
import { Game, TYPES } from "../shared/game.js";
import { createMap, solid } from "../shared/maps.js";
const setup = () => {
  const g = new Game({ random: () => 0.4 });
  for (let n = 0; n < 3; n++) g.join("p" + n, "Player " + n);
  g.tick(1 / 30);
  return g;
};
test("one seeker, 30-second isolation, private snapshots, late joins and release", () => {
  const g = setup();
  assert.equal(g.phase, "hiding");
  const seeker = g.active().find((p) => p.role === "seeker"),
    hider = g.active().find((p) => p.role === "hider");
  assert.equal(g.active().filter((p) => p.role === "seeker").length, 1);
  assert.equal(seeker.x, 45);
  assert.equal(g.snapshot(seeker.id).players.length, 1);
  assert.equal(g.throw(seeker.id, { x: 1, y: 0, z: 0 }), false);
  const before = hider.x;
  Object.assign(hider, g.map.release);
  g.input(hider.id, { x: 1, z: 0 });
  g.tick(0.03);
  assert.notEqual(hider.x, g.map.release.x);
  g.join("late", "Late");
  assert.equal(g.players.get("late").role, "waiting");
  g.tick(30);
  assert.equal(g.phase, "playing");
  assert.equal(g.until - g.time, 300);
  assert.notEqual(seeker.x, 45);
});
test("server ignores coordinates, bounds input and blocks walls", () => {
  const g = setup(),
    p = g.active().find((p) => p.role === "hider");
  Object.assign(p, { x: 30, y: 0, z: 0 });
  g.input(p.id, { x: 999, z: 0, y: 999 });
  for (let i = 0; i < 90; i++) g.tick(1 / 30);
  assert(p.x < 32);
  assert(p.x >= 30);
  assert(p.y < 0.1);
});
test("projectile infection, cooldown, shield and immediate converted throw", () => {
  const g = setup();
  g.tick(30);
  const s = g.active().find((p) => p.role === "seeker"),
    hs = g.active().filter((p) => p.role === "hider");
  g.map = { ...g.map, blocks: [{ x: 0, y: -0.5, z: 0, w: 64, h: 1, d: 64 }] };
  Object.assign(s, { x: 0, y: 0, z: 0 });
  Object.assign(hs[0], { x: 0, y: 0, z: -3 });
  Object.assign(hs[1], { x: 12, y: 0, z: 12 });
  assert(g.throw(s.id, { x: 0, y: 0, z: -1 }));
  assert(!g.throw(s.id, { x: 0, y: 0, z: -1 }));
  for (let i = 0; i < 8; i++) g.tick(1 / 30);
  assert.equal(hs[0].role, "seeker");
  assert(g.throw(hs[0].id, { x: 1, y: 0, z: 0 }));
  g.projectiles = [];
  Object.assign(hs[1], { x: 0, y: 0, z: -3 });
  hs[1].effects.shield = g.time + 100;
  s.cooldown = 0;
  g.throw(s.id, { x: 0, y: 0, z: -1 });
  for (let i = 0; i < 8; i++) g.tick(1 / 30);
  assert.equal(hs[1].role, "hider");
  assert(!hs[1].effects.shield);
});
test("projectiles stop at walls", () => {
  const g = setup();
  g.tick(30);
  const s = g.active().find((p) => p.role === "seeker"),
    h = g.active().find((p) => p.role === "hider");
  Object.assign(s, { x: 0, y: 0, z: 0 });
  Object.assign(h, { x: 0, y: 0, z: -4 });
  g.map.blocks.push({ x: 0, y: 1, z: -2, w: 4, h: 3, d: 0.5 });
  g.throw(s.id, { x: 0, y: 0, z: -1 });
  for (let n = 0; n < 12; n++) g.tick(1 / 30);
  assert.equal(h.role, "hider");
  assert.equal(g.projectiles.length, 0);
});
test("inventory capacity and all eight effects", () => {
  for (const type of TYPES) {
    const g = setup(),
      h = g.active().find((p) => p.role === "hider"),
      s = g.active().find((p) => p.role === "seeker");
    Object.assign(h, g.map.release);
    g.pickups = [0, 1, 2].map((id) => ({ id, ...g.map.release, type }));
    g.tick(0.01);
    g.tick(0.01);
    g.tick(0.01);
    assert.equal(h.inventory.length, 2);
    assert.equal(g.pickups.length, 1);
    Object.assign(s, { x: h.x + 2, y: h.y, z: h.z });
    assert(g.use(h.id, 0));
    assert.equal(h.inventory.length, 1);
    if (type === "invisibility") {
      assert(h.effects.invisibility > g.time);
      assert(!g.snapshot(s.id).players.some((p) => p.id === h.id));
    }
    if (type === "speed") assert(h.effects.speed > g.time);
    if (type === "teleport") assert(!solid(g.map, h.x, h.y, h.z));
    if (type === "decoy") assert.equal(g.decoys.length, 1);
    if (type === "freeze") assert(s.effects.freeze > g.time);
    if (type === "shield") assert(h.effects.shield > g.time);
    if (type === "jump") assert(h.effects.jump > g.time);
    if (type === "smoke") assert.equal(g.smoke.length, 1);
    g.convert(h);
    assert.equal(h.inventory.length, 0);
    assert.deepEqual(h.effects, {});
    assert.equal(g.use(h.id, 0), false);
  }
});
test("six maps have safe spawns, boundary collision and elevated geometry", () => {
  for (let i = 0; i < 6; i++) {
    const m = createMap(i);
    assert(m.spawns.length >= 12);
    for (const p of m.spawns) assert(!solid(m, p.x, p.y, p.z));
    assert(solid(m, 32, 0, 0));
    assert(m.blocks.some((b) => b.y - b.h / 2 > 1));
  }
});
test("timer victory, intermission and automatic round reset", () => {
  const g = setup();
  g.tick(30);
  g.tick(300);
  assert.equal(g.result, "HIDERS WIN");
  assert.equal(g.phase, "intermission");
  g.join("late", "Late");
  g.tick(10);
  assert.equal(g.phase, "hiding");
  assert.equal(g.players.get("late").role, "hider");
  for (const p of g.active()) assert.equal(p.inventory.length, 0);
  g.tick(30);
  for (const p of g.active()) if (p.role === "hider") g.convert(p);
  g.check();
  assert.equal(g.result, "SEEKERS WIN");
});
test("seeker disconnect promotes replacement and reconnect waits", () => {
  const g = setup(),
    id = g.original;
  g.leave(id);
  assert.equal(g.active().filter((p) => p.role === "seeker").length, 1);
  g.join(id, "Returning");
  assert.equal(g.players.get(id).role, "waiting");
});
test("speed changes travel, freeze stops movement, effects expire and jump lifts player", () => {
  const g = setup();
  g.tick(30);
  g.map.blocks = [{ x: 0, y: -0.5, z: 0, w: 64, h: 1, d: 64 }];
  const h = g.active().find((p) => p.role === "hider"),
    s = g.active().find((p) => p.role === "seeker");
  Object.assign(h, { x: 0, y: 0, z: 0 });
  g.input(h.id, { x: 1, z: 0 });
  for (let n = 0; n < 15; n++) g.tick(1 / 30);
  const normal = h.x;
  Object.assign(h, { x: 0, y: 0, z: 0 });
  h.effects.speed = g.time + 15;
  for (let n = 0; n < 15; n++) g.tick(1 / 30);
  assert(Math.abs(h.x - normal * 2) < 0.01);
  Object.assign(s, { x: 0, y: 0, z: 10 });
  s.effects.freeze = g.time + 5;
  g.input(s.id, { x: 1, z: 0 });
  for (let n = 0; n < 15; n++) g.tick(1 / 30);
  assert.equal(s.x, 0);
  h.effects.jump = g.time + 20;
  g.input(h.id, { jump: true });
  g.tick(1 / 30);
  assert(h.y > 0.4);
  h.effects.invisibility = g.time + 0.1;
  for (let n = 0; n < 5; n++) g.tick(1 / 30);
  assert(!h.effects.invisibility);
});
test("twelve active players share the round and powerup count stays bounded", () => {
  const g = new Game();
  for (let i = 0; i < 12; i++) g.join("load" + i, "Load " + i);
  g.tick(1 / 30);
  assert.equal(g.active().length, 12);
  assert.equal(g.snapshot("load0").counts.hiders, 11);
  for (let i = 0; i < 150; i++) {
    g.spawnAt = 0;
    g.tick(1 / 30);
  }
  assert(g.pickups.length <= 24);
});
test("super-jump cannot bypass arena limits above the walls", () => {
  const g = setup(),
    p = g.active().find((p) => p.role === "hider");
  Object.assign(p, { x: 31, y: 15, z: 0 });
  g.input(p.id, { x: 1, z: 0 });
  for (let n = 0; n < 10; n++) g.tick(1 / 30);
  assert(p.x <= 31.1);
});
test("invisibility actually filters active seekers, preserves self, and expires", () => {
  const g = setup();
  g.tick(30);
  const h = g.active().find((p) => p.role === "hider"),
    s = g.active().find((p) => p.role === "seeker");
  assert(g.snapshot(s.id).players.some((p) => p.id === h.id));
  h.inventory = ["invisibility"];
  g.use(h.id, 0);
  assert(!g.snapshot(s.id).players.some((p) => p.id === h.id));
  assert(g.snapshot(h.id).players.some((p) => p.id === h.id));
  for (let n = 0; n < 901; n++) g.tick(1 / 30);
  assert(g.snapshot(s.id).players.some((p) => p.id === h.id));
});
test("decoys move and decoy/smoke lifetimes are enforced", () => {
  const g = setup(),
    h = g.active().find((p) => p.role === "hider");
  g.map.blocks = [{ x: 0, y: -0.5, z: 0, w: 64, h: 1, d: 64 }];
  Object.assign(h, { x: 0, y: 0, z: 0 });
  h.inventory = ["decoy", "smoke"];
  g.use(h.id, 0);
  g.use(h.id, 0);
  for (let n = 0; n < 30; n++) g.tick(1 / 30);
  assert(g.decoys[0].z > 2);
  assert.equal(g.smoke.length, 1);
  for (let n = 0; n < 300; n++) g.tick(1 / 30);
  assert.equal(g.smoke.length, 0);
  assert.equal(g.decoys.length, 1);
  for (let n = 0; n < 150; n++) g.tick(1 / 30);
  assert.equal(g.decoys.length, 0);
});

test("hiders run at half seeker speed and boost temporarily restores seeker pace", () => {
  const g = setup();
  g.tick(30);
  g.map.blocks = [{ x: 0, y: -0.5, z: 0, w: 64, h: 1, d: 64 }];
  const h = g.active().find((p) => p.role === "hider"),
    s = g.active().find((p) => p.role === "seeker");
  Object.assign(h, { x: 0, y: 0, z: 0 });
  Object.assign(s, { x: 0, y: 0, z: 10 });
  g.input(h.id, { x: 1, z: 0 });
  g.input(s.id, { x: 1, z: 0 });
  for (let n = 0; n < 30; n++) g.tick(1 / 30);
  assert(Math.abs(h.x - 3) < 0.01);
  assert(Math.abs(s.x - 6) < 0.01);
  h.effects.speed = g.time + 15;
  const start = h.x;
  for (let n = 0; n < 30; n++) g.tick(1 / 30);
  assert(Math.abs(h.x - start - 6) < 0.01);
});
test("each map adds eight usable shelters with front and side escape routes", () => {
  for (let i = 0; i < 6; i++) {
    const map = createMap(i);
    assert.equal(map.hidingSpots.length, 8, map.name);
    for (const p of map.hidingSpots) {
      // Standing room, entry straight from the front, and a second exit on the right.
      for (let d = 0; d <= 3; d += 0.1) {
        assert(!solid(map, p.x, 0, p.z + d), `${map.name} blocked front entry`);
        assert(
          !solid(map, p.x + d, 0, p.z + 1),
          `${map.name} blocked side exit`,
        );
      }
      assert(solid(map, p.x, 0, p.z - 1.8), `${map.name} missing rear cover`);
    }
  }
});
