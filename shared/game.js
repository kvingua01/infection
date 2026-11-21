import { PROJECTILE_SPEED, PROJECTILE_COOLDOWN, projectileHitTime } from "./projectile.js";
import { createMap, solid } from "./maps.js";
import { HUNTER_BURST_SECONDS, HUNTER_POWER_UPS } from "./hunter.js";

const hunterTypes = Object.keys(HUNTER_POWER_UPS);
const withinPickupRange = (a, b) =>
  Math.hypot(a.x - b.x, a.z - b.z) < 1.3 && Math.abs(a.y - b.y) < 2;
export const TYPES = [
  "invisibility",
  "speed",
  "teleport",
  "decoy",
  "freeze",
  "jump",
  "smoke",
];
export class Game {
  constructor({
    random = Math.random,
    hide = 30,
    round = 300,
    intermission = 10,
    autoStart = true,
    hunterSpawnChance = 0.125,
  } = {}) {
    this.random = random;
    this.autoStart = autoStart;
    this.hunterSpawnChance = hunterSpawnChance;
    this.durations = { hide, round, intermission };
    this.players = new Map();
    this.map = createMap(0);
    this.phase = "lobby";
    this.until = 0;
    this.time = 0;
    this.projectiles = [];
    this.pickups = [];
    this.decoys = [];
    this.smoke = [];
    this.result = null;
    this.serial = 0;
    this.spawnAt = 0;
    this.hunterPickup = null;
    this.hunterBursts = [];
    this.visionUntil = 0;
  }
  pick(a) {
    return a[Math.floor(this.random() * a.length)];
  }
  safe() {
    return {
      ...this.pick(
        this.map.spawns.filter(
          (p) => Math.abs(p.x) <= 24 && Math.abs(p.z) <= 24,
        ),
      ),
    };
  }
  join(id, name) {
    const p = {
      id,
      name: String(name || "Player")
        .replace(/[<>\x00-\x1f]/g, "")
        .slice(0, 18),
      role: "waiting",
      ...this.map.release,
      vy: 0,
      yaw: 0,
      input: {},
      inventory: [],
      hunterItem: null,
      hunterNotice: null,
      effects: {},
      cooldown: 0,
      score: 0,
      caught: 0,
      color: Math.floor(this.random() * 0xffffff),
    };
    this.players.set(id, p);
    return p;
  }
  leave(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    if (
      p?.role === "seeker" &&
      !this.active().some((p) => p.role === "seeker") &&
      ["hiding", "playing"].includes(this.phase)
    ) {
      const next = this.active()[0];
      if (next) {
        this.convert(next);
        if (this.phase === "hiding") {
          Object.assign(next, { x: 45, y: 0, z: 0, vy: 0 });
          this.original = next.id;
        }
      } else this.end("No players remain");
    }
    this.check();
  }
  active() {
    return [...this.players.values()].filter((p) => p.role !== "waiting");
  }
  start() {
    if (this.players.size < 2) return;
    this.map = createMap(Math.floor(this.random() * 6));
    this.phase = "hiding";
    this.until = this.time + this.durations.hide;
    this.result = null;
    this.projectiles = [];
    this.pickups = [];
    this.decoys = [];
    this.smoke = [];
    for (const p of this.players.values())
      Object.assign(p, this.safe(), {
        role: "hider",
        vy: 0,
        inventory: [],
        hunterItem: null,
        hunterNotice: null,
        effects: {},
        input: {},
        cooldown: 0,
      });
    const seeker = this.pick(this.active());
    seeker.role = "seeker";
    Object.assign(seeker, { x: 45, y: 0, z: 0 });
    this.original = seeker.id;
    this.spawnAt = this.time;
  }
  input(id, data) {
    const p = this.players.get(id);
    if (!p || !data || typeof data !== "object") return;
    const num = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    p.input = { x: num(data.x), z: num(data.z), jump: !!data.jump };
    if (Number.isFinite(data.yaw)) p.yaw = data.yaw % (Math.PI * 2);
  }
  convert(p) {
    if (p.role !== "hider") return;
    p.role = "seeker";
    p.inventory = [];
    p.hunterItem = null;
    p.hunterNotice = null;
    p.effects = {};
    p.cooldown = this.time;
    p.converted = this.time;
  }
  throw(id, d) {
    const p = this.players.get(id);
    if (
      !p ||
      p.role !== "seeker" ||
      this.phase !== "playing" ||
      p.cooldown > this.time ||
      p.effects.freeze > this.time
    )
      return false;
    if (!d || ![d.x, d.y, d.z].every(Number.isFinite)) return false;
    const len = Math.hypot(d.x, d.y, d.z);
    if (!Number.isFinite(len) || len < 0.1) return false;
    p.cooldown = this.time + PROJECTILE_COOLDOWN;
    this.projectiles.push({
      id: ++this.serial,
      owner: id,
      x: p.x,
      y: p.y + 1.2,
      z: p.z,
      dx: d.x / len,
      dy: d.y / len,
      dz: d.z / len,
      expires: this.time + 3,
    });
    return true;
  }
  use(id, slot) {
    const p = this.players.get(id);
    if (p?.role === "seeker" && [0, 1].includes(slot)) return this.useHunter(p);
    if (
      !p ||
      p.role !== "hider" ||
      !["playing", "hiding"].includes(this.phase) ||
      ![0, 1].includes(slot) ||
      !TYPES.includes(p.inventory[slot])
    )
      return false;
    const type = p.inventory.splice(slot, 1)[0],
      t = this.time;
    switch (type) {
      case "invisibility":
        p.effects.invisibility = t + 12;
        break;
      case "speed":
        p.effects.speed = t + 15;
        break;
      case "teleport":
        Object.assign(p, this.safe(), { vy: 0 });
        break;
      case "decoy":
        this.decoys.push({
          id: "d" + ++this.serial,
          name: p.name,
          color: p.color,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          expires: t + 15,
        });
        break;
      case "freeze":
        for (const s of this.active())
          if (s.role === "seeker" && Math.hypot(s.x - p.x, s.z - p.z) < 12)
            s.effects.freeze = t + 5;
        break;
      case "jump":
        p.effects.jump = t + 20;
        break;
      case "smoke":
        this.smoke.push({
          id: ++this.serial,
          x: p.x,
          y: p.y,
          z: p.z,
          expires: t + 10,
        });
        break;
    }
    return true;
  }
  notifyHunter(p, text) {
    p.hunterNotice = { text, expires: this.time + 3 };
  }
  useHunter(p) {
    const type = p.hunterItem;
    if (
      p.role !== "seeker" || this.phase !== "playing" || !hunterTypes.includes(type)
    )
      return false;
    p.hunterItem = null;
    this.notifyHunter(p, `Activated ${HUNTER_POWER_UPS[type].name}!`);
    this.hunterBursts.push({
      x: p.x,
      y: p.y,
      z: p.z,
      expires: this.time + HUNTER_BURST_SECONDS,
    });
    if (type === "vision") {
      this.visionUntil = this.time + 2;
      return true;
    }
    for (const hider of this.active()) {
      if (hider.role !== "hider") continue;
      if (type === "disruptor") {
        if (!hider.inventory.length) continue;
        hider.inventory.splice(Math.floor(this.random() * hider.inventory.length), 1);
        this.notifyHunter(hider, "A hunter destroyed one of your power-ups!");
      } else {
        for (const [buff, expires] of Object.entries(hider.effects)) {
          const shortened = expires - 15;
          if (shortened <= this.time) delete hider.effects[buff];
          else hider.effects[buff] = shortened;
        }
        this.notifyHunter(hider, "A hunter weakened your active power-ups!");
      }
    }
    return true;
  }
  check() {
    if (
      this.phase === "playing" &&
      this.active().length &&
      !this.active().some((p) => p.role === "hider")
    )
      this.end("SEEKERS WIN");
  }
  end(message) {
    if (!["hiding", "playing"].includes(this.phase)) return;
    this.result = message;
    for (const p of this.active())
      if (
        (message === "HIDERS WIN" && p.role === "hider") ||
        (message === "SEEKERS WIN" && p.role === "seeker")
      )
        p.score++;
    this.hunterPickup = null;
    this.hunterBursts = [];
    this.visionUntil = 0;
    for (const p of this.players.values()) {
      p.hunterItem = null;
      p.hunterNotice = null;
    }
    this.phase = "intermission";
    this.until = this.time + this.durations.intermission;
  }
  tick(dt) {
    this.time += dt;
    if (this.autoStart && this.phase === "lobby" && this.players.size >= 2)
      this.start();
    if (this.phase === "intermission" && this.time >= this.until) {
      if (this.players.size >= 2) this.start();
      else {
        this.phase = "lobby";
        for (const p of this.players.values()) p.role = "waiting";
      }
    }
    if (this.phase === "hiding" && this.time >= this.until) {
      this.phase = "playing";
      this.until = this.time + this.durations.round;
      for (const p of this.active())
        if (p.role === "seeker") Object.assign(p, this.map.release, { vy: 0 });
    }
    if (this.phase === "playing" && this.time >= this.until)
      this.end("HIDERS WIN");
    for (const p of this.players.values()) {
      if (
        p.role === "waiting" ||
        !["hiding", "playing"].includes(this.phase) ||
        (this.phase === "hiding" && p.role === "seeker")
      )
        continue;
      for (const k in p.effects)
        if (p.effects[k] <= this.time) delete p.effects[k];
      const frozen = p.effects.freeze > this.time;
      let { x = 0, z = 0, jump = false } = p.input;
      const l = Math.max(1, Math.hypot(x, z)),
        speed =
          (p.role === "hider" ? 3 : 6) *
          (p.effects.speed > this.time ? 2 : 1) *
          (frozen ? 0 : 1);
      x = (x / l) * speed * dt;
      z = (z / l) * speed * dt;
      const move = (dx, dz) => {
        if (!solid(this.map, p.x + dx, p.y, p.z + dz)) {
          p.x += dx;
          p.z += dz;
        } else if (
          solid(this.map, p.x, p.y - 0.06, p.z) &&
          !solid(this.map, p.x + dx, p.y + 0.42, p.z + dz)
        ) {
          p.y += 0.42;
          p.x += dx;
          p.z += dz;
        }
      };
      move(x, 0);
      move(0, z);
      p.x = Math.max(-31.1, Math.min(31.1, p.x));
      p.z = Math.max(-31.1, Math.min(31.1, p.z));
      if (jump && !frozen && solid(this.map, p.x, p.y - 0.06, p.z))
        p.vy = p.effects.jump > this.time ? 14 : 8;
      p.vy -= 22 * dt;
      let dy = p.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.1));
      for (let n = 0; n < steps; n++) {
        if (solid(this.map, p.x, p.y + dy / steps, p.z)) {
          p.vy = 0;
          break;
        }
        p.y += dy / steps;
      }
      if (p.y < -10) Object.assign(p, this.safe(), { vy: 0 });
      if (p.role === "hider" && p.inventory.length < 2) {
        const i = this.pickups.findIndex((q) => withinPickupRange(q, p));
        if (i >= 0) p.inventory.push(this.pickups.splice(i, 1)[0].type);
      }
    }
    if (
      ["hiding", "playing"].includes(this.phase) &&
      this.time >= this.spawnAt
    ) {
      this.spawnAt = this.time + 4;
      if (this.pickups.length < 24)
        this.pickups.push({
          id: ++this.serial,
          ...this.safe(),
          type: this.pick(TYPES),
        });
      if (!this.hunterPickup && this.random() < this.hunterSpawnChance)
        this.hunterPickup = {
          id: ++this.serial,
          ...this.safe(),
          type: this.pick(hunterTypes),
        };
    }
    const hiders = this.active().filter((p) => p.role === "hider").map((p) => {
      // The block avatar spans 1.14 units across the arms and 1.865 vertically.
      const sin = Math.abs(Math.sin(p.yaw));
      const cos = Math.abs(Math.cos(p.yaw));
      const height = 1.865;
      return { player: p, box: {
        x: p.x, y: p.y + height / 2, z: p.z,
        w: 1.14 * cos + 0.566 * sin, h: height,
        d: 1.14 * sin + 0.566 * cos,
      } };
    });
    this.projectiles = this.projectiles.filter((b) => {
      const flight = Math.min(dt, Math.max(0, b.expires - (this.time - dt)));
      if (!flight) return b.expires > this.time;
      const distance = flight * PROJECTILE_SPEED;
      const travel = { x: b.dx * distance, y: b.dy * distance, z: b.dz * distance };
      let impact = Infinity;
      for (const block of this.map.blocks)
        impact = Math.min(impact, projectileHitTime(b, travel, block, Math.min(1, impact)));
      let target;
      for (const { player, box } of hiders) {
        if (player.role !== "hider") continue;
        const hit = projectileHitTime(b, travel, box, Math.min(1, impact));
        if (hit < impact) {
          impact = hit;
          target = player;
        }
      }
      if (target) {
        this.convert(target);
        const owner = this.players.get(b.owner);
        if (owner) owner.caught++;
      }
      if (impact !== Infinity || b.expires <= this.time) return false;
      b.x += travel.x;
      b.y += travel.y;
      b.z += travel.z;
      return true;
    });
    for (const d of this.decoys) {
      const dx = Math.sin(d.yaw) * dt * 3,
        dz = Math.cos(d.yaw) * dt * 3;
      if (!solid(this.map, d.x + dx, d.y, d.z + dz)) {
        d.x += dx;
        d.z += dz;
      } else d.yaw += 1.5;
    }
    this.decoys = this.decoys.filter((d) => d.expires > this.time);
    this.smoke = this.smoke.filter((s) => s.expires > this.time);
    if (this.phase === "playing" && this.hunterPickup) {
      const seeker = this.active().find((p) =>
        p.role === "seeker" && !p.hunterItem && withinPickupRange(this.hunterPickup, p),
      );
      if (seeker) {
        seeker.hunterItem = this.hunterPickup.type;
        this.hunterPickup = null;
        this.notifyHunter(seeker, `Collected ${HUNTER_POWER_UPS[seeker.hunterItem].name}`);
      }
    }
    this.hunterBursts = this.hunterBursts.filter((burst) => burst.expires > this.time);
    this.check();
  }
  snapshot(id) {
    const me = this.players.get(id),
      locked = this.phase === "hiding" && me?.role === "seeker";
    const visible = (p) =>
      p.id === id ||
      (!locked &&
        !(
          p.role === "hider" &&
          p.effects.invisibility > this.time &&
          me?.role !== "hider"
        ));
    return {
      time: this.time,
      phase: this.phase,
      remaining: Math.max(0, this.until - this.time),
      map: this.map.index,
      result: this.result,
      original: this.original,
      counts: {
        hiders: this.active().filter((p) => p.role === "hider").length,
        seekers: this.active().filter((p) => p.role === "seeker").length,
      },
      players: [...this.players.values()].filter(visible).map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        color: p.color,
        converted: p.converted,
        effects:
          p.id === id
            ? p.effects
            : { freeze: p.effects.freeze },
        ...(p.id === id
          ? {
              inventory: p.inventory,
              hunterItem: p.hunterItem,
              hunterNotice: p.hunterNotice?.expires > this.time ? p.hunterNotice : null,
              cooldown: Math.max(0, p.cooldown - this.time),
            }
          : {}),
      })),
      pickups: locked ? [] : this.pickups,
      hunterPickup: locked ? null : this.hunterPickup,
      hunterBursts: locked ? [] : this.hunterBursts,
      ...(me?.role === "seeker" && this.visionUntil > this.time
        ? {
            hunterVision: {
              until: this.visionUntil,
              targets: this.active()
                .filter((p) => p.role === "hider")
                .map(({ x, y, z }) => ({ x, y, z })),
            },
          }
        : {}),
      projectiles: locked ? [] : this.projectiles,
      decoys: locked ? [] : this.decoys,
      smoke: locked ? [] : this.smoke,
      scoreboard: [...this.players.values()].map((p) => ({
        name: p.name,
        score: p.score,
        caught: p.caught,
        role: p.role,
      })),
    };
  }
}
