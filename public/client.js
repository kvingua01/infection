import * as THREE from "three";
import { createMap, solid } from "/shared/maps.js";
const $ = (id) => document.getElementById(id),
  socket = io(),
  canvas = $("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9d0dc");
scene.fog = new THREE.Fog("#a9d0dc", 35, 100);
const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.1,
  150,
);
scene.add(new THREE.HemisphereLight(0xcceeff, 0x6e674f, 2.4));
const sun = new THREE.DirectionalLight(0xffedcf, 2.2);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -40,
  right: 40,
  top: 40,
  bottom: -40,
});
scene.add(sun);
const world = new THREE.Group(),
  actors = new THREE.Group(),
  items = new THREE.Group();
scene.add(world, actors, items);
const geometry = new THREE.BoxGeometry(1, 1, 1),
  materials = new Map(),
  models = new Map();
let mapIndex = -1,
  map = createMap(0),
  state = null,
  myId = null,
  selected = 0,
  queuedJump = false,
  yaw = 0,
  pitch = 0.3,
  keys = {},
  last = performance.now(),
  showScores = false;
const textureCanvas = document.createElement("canvas");
textureCanvas.width = textureCanvas.height = 16;
const tc = textureCanvas.getContext("2d");
tc.fillStyle = "#eeeeee";
tc.fillRect(0, 0, 16, 16);
for (let n = 0; n < 55; n++) {
  tc.fillStyle = n % 2 ? "#dddddd" : "#ffffff";
  tc.fillRect((n * 7) % 16, (n * 11) % 16, 2, 2);
}
const blockTexture = new THREE.CanvasTexture(textureCanvas);
blockTexture.magFilter = THREE.NearestFilter;
blockTexture.colorSpace = THREE.SRGBColorSpace;
function material(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshLambertMaterial({ color, map: blockTexture }),
    );
  return materials.get(color);
}
function cube(parent, x, y, z, w, h, d, color) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function textSprite(text) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#162638dd";
  ctx.fillRect(0, 0, 512, 64);
  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 42);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    depthTest: true,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(3.5, 0.44, 1);
  return s;
}
function disposeObject(object) {
  object.traverse((c) => {
    if (c.isSprite) {
      c.material.map?.dispose();
      c.material.dispose();
    } else if (c.userData.ownedMaterial) c.material.dispose();
  });
}
function clear(group) {
  for (const c of [...group.children]) {
    group.remove(c);
    disposeObject(c);
  }
}
function loadMap(index) {
  mapIndex = index;
  map = createMap(index);
  clear(world);
  for (const b of map.blocks)
    cube(world, b.x, b.y, b.z, b.w, b.h, b.d, b.color);
  for (const l of map.labels) {
    const t = textSprite(l.text);
    t.position.set(l.x, l.y, l.z);
    world.add(t);
  }
}
function player(p) {
  const group = new THREE.Group(),
    skin = p.role === "seeker" ? 0xf67362 : p.color;
  cube(group, 0, 1, 0, 0.65, 0.7, 0.36, skin);
  cube(group, 0, 1.6, 0, 0.53, 0.53, 0.53, 0xe4b58d);
  cube(group, -0.22, 0.35, 0, 0.23, 0.7, 0.28, 0x344964);
  cube(group, 0.22, 0.35, 0, 0.23, 0.7, 0.28, 0x344964);
  cube(group, -0.46, 1, 0, 0.22, 0.7, 0.25, skin);
  cube(group, 0.46, 1, 0, 0.22, 0.7, 0.25, skin);
  cube(group, -0.13, 1.66, -0.273, 0.08, 0.08, 0.02, 0x162638);
  cube(group, 0.13, 1.66, -0.273, 0.08, 0.08, 0.02, 0x162638);
  const tag = textSprite(p.name);
  tag.position.y = 2.2;
  group.add(tag);
  group.traverse((c) => {
    if (c.isMesh) {
      c.material = c.material.clone();
      c.userData.ownedMaterial = true;
    }
  });
  group.userData = { role: p.role };
  group.position.set(p.x, p.y, p.z);
  actors.add(group);
  return group;
}
const colors = {
  invisibility: "#b19fea",
  speed: "#ffcf55",
  teleport: "#64d6e3",
  decoy: "#ed9bd7",
  freeze: "#94d8ff",
  shield: "#8dadff",
  jump: "#b8ed79",
  smoke: "#bdc2d0",
};
function renderItems() {
  clear(items);
  if (!state) return;
  for (const p of state.pickups) {
    const c = cube(
      items,
      p.x,
      p.y + 1.1 + Math.sin(state.time * 3 + p.id) * 0.15,
      p.z,
      0.6,
      0.6,
      0.6,
      colors[p.type],
    );
    c.rotation.y = state.time;
    const light = new THREE.PointLight(colors[p.type], 1.5, 3);
    light.position.copy(c.position);
    items.add(light);
  }
  for (const b of state.projectiles)
    cube(items, b.x, b.y, b.z, 0.32, 0.32, 0.32, "#ff795e");
  for (const d of state.decoys) {
    const g = player({ ...d, role: "hider" });
    actors.remove(g);
    items.add(g);
    g.rotation.y = d.yaw;
  }
  for (const s of state.smoke) {
    for (let n = 0; n < 12; n++) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          color: "#9da8b2",
          transparent: true,
          opacity: 0.8,
        }),
      );
      mesh.userData.ownedMaterial = true;
      mesh.position.set(
        s.x + Math.sin(n * 8) * 3,
        s.y + 1 + (n % 3),
        s.z + Math.cos(n * 8) * 3,
      );
      mesh.scale.set(3, 3, 3);
      items.add(mesh);
    }
  }
}
$("form").onsubmit = (e) => {
  e.preventDefault();
  if (!socket.connected) {
    $("connection").textContent = "Connection unavailable. Reconnecting…";
    return;
  }
  socket.emit("join", $("nickname").value, (r) => {
    if (r.error) {
      $("connection").textContent = r.error;
      return;
    }
    myId = r.id;
    $("join").hidden = true;
    $("hud").hidden = false;
    canvas.requestPointerLock();
  });
};
socket.on("disconnect", () => {
  $("error").hidden = false;
  $("error").textContent =
    "Connection lost. Rejoin after reconnection; active-round arrivals wait until the next round.";
  myId = null;
  $("join").hidden = false;
  $("hud").hidden = true;
});
socket.on("connect", () => {
  $("error").hidden = true;
});
socket.on("state", (s) => {
  state = s;
  if (s.map !== mapIndex) loadMap(s.map);
  const me = s.players.find((p) => p.id === myId);
  const ids = new Set(s.players.map((p) => p.id));
  for (const [id, g] of models)
    if (!ids.has(id)) {
      actors.remove(g);
      disposeObject(g);
      models.delete(id);
    }
  for (const p of s.players) {
    let g = models.get(p.id);
    if (g && g.userData.role !== p.role) {
      actors.remove(g);
      disposeObject(g);
      models.delete(p.id);
      g = null;
    }
    if (!g) {
      g = player(p);
      models.set(p.id, g);
    }
    g.userData.target = p;
    g.visible = p.role !== "waiting";
  }
  if (me) {
    $("role").textContent = me.role.toUpperCase();
    $("role").style.borderColor = me.role === "seeker" ? "#ff795e" : "#c5ed80";
    $("inventory").innerHTML = "";
    for (let n = 0; n < 2; n++) {
      const el = document.createElement("div");
      el.className = "slot" + (selected === n ? " selected" : "");
      el.textContent = `${n + 1}  ${(me.inventory[n] || "EMPTY").toUpperCase()}`;
      $("inventory").append(el);
    }
    $("effects").textContent = Object.entries(me.effects)
      .filter(([, v]) => v > s.time)
      .map(([k, v]) => `${k.toUpperCase()} ${Math.ceil(v - s.time)}s`)
      .join(" · ");
    $("cooldown").textContent =
      me.role === "seeker"
        ? me.cooldown > 0
          ? `PROJECTILE · ${me.cooldown.toFixed(1)}s`
          : "PROJECTILE READY · LEFT CLICK"
        : "COLLECT CUBES · F TO ACTIVATE";
  }
  $("map").textContent = map.name;
  const seconds = Math.ceil(s.remaining);
  $("timer").textContent = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  $("counts").textContent =
    `${s.counts.hiders} HIDERS  /  ${s.counts.seekers} SEEKERS`;
  $("notice").textContent =
    s.phase === "lobby"
      ? "WAITING FOR AT LEAST TWO PLAYERS"
      : s.phase === "hiding"
        ? me?.role === "seeker"
          ? "ISOLATED · YOUR HUNT BEGINS SOON"
          : "FIND YOUR HIDING SPOT"
        : me?.role === "waiting"
          ? "SPECTATING · JOINING NEXT ROUND"
          : "";
  $("scores").hidden = !(showScores || s.phase === "intermission");
  $("result").textContent =
    s.phase === "intermission" ? s.result : "SCOREBOARD";
  $("scoreRows").replaceChildren();
  for (const p of [...s.scoreboard].sort((a, b) => b.score - a.score)) {
    const row = document.createElement("div");
    const a = document.createElement("span"),
      b = document.createElement("span");
    a.textContent = p.name;
    b.textContent = `${p.score} wins · ${p.caught} catches · ${p.role}`;
    row.append(a, b);
    $("scoreRows").append(row);
  }
  $("next").textContent =
    s.phase === "intermission" ? `Next round in ${seconds}s` : "";
  renderItems();
});
$("closeScores").onclick = () => {
  showScores = false;
  if (state?.phase !== "intermission") $("scores").hidden = true;
};
canvas.onclick = () => {
  if (!myId) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    return;
  }
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  const ray = new THREE.Raycaster(camera.position, d);
  const hit = ray.intersectObjects(world.children, false)[0];
  const aim = hit ? hit.point : camera.position.clone().addScaledVector(d, 100);
  const me = models.get(myId);
  if (me)
    d.copy(aim)
      .sub(me.position.clone().add(new THREE.Vector3(0, 1.2, 0)))
      .normalize();
  socket.emit("throw", { x: d.x, y: d.y, z: d.z });
};
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0025;
  pitch = Math.max(-0.65, Math.min(1.2, pitch + e.movementY * 0.0025));
});
addEventListener("keydown", (e) => {
  if (document.activeElement.tagName === "INPUT") return;
  if (["Space", "Tab"].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === "Space") queuedJump = true;
  if (e.code === "Digit1") selected = 0;
  if (e.code === "Digit2") selected = 1;
  if (e.code === "KeyF" && !e.repeat) socket.emit("use", selected);
  if (e.code === "Tab") showScores = true;
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Tab") showScores = false;
});
addEventListener("blur", () => (keys = {}));
setInterval(() => {
  if (!myId) return;
  const forward = Number(!!keys.KeyW) - Number(!!keys.KeyS),
    side = Number(!!keys.KeyD) - Number(!!keys.KeyA);
  socket.emit("input", {
    x: -Math.sin(yaw) * forward + Math.cos(yaw) * side,
    z: -Math.cos(yaw) * forward - Math.sin(yaw) * side,
    jump: !!keys.Space || queuedJump,
    yaw,
  });
  queuedJump = false;
}, 1000 / 30);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const g of models.values()) {
    const p = g.userData.target;
    if (!p) continue;
    g.position.lerp(new THREE.Vector3(p.x, p.y, p.z), 1 - Math.exp(-dt * 18));
    g.rotation.y = p.yaw;
    const invisible = p.id === myId && p.effects.invisibility > state.time;
    g.traverse((c) => {
      if (c.isMesh) {
        c.material.transparent = !!invisible;
        c.material.opacity = invisible ? 0.28 : 1;
        c.material.emissive.setHex(
          p.converted && state.time - p.converted < 1 ? 0xff5a36 : 0,
        );
      }
    });
  }
  const me = models.get(myId);
  if (me) {
    const target = me.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const aimDirection = offset.clone().negate();
    offset
      .multiplyScalar(6)
      .add(new THREE.Vector3(Math.cos(yaw) * 0.85, 0, -Math.sin(yaw) * 0.85))
      .normalize();
    let distance = 6;
    for (let d = 0.4; d < 6; d += 0.2) {
      const p = target.clone().addScaledVector(offset, d);
      if (solid(map, p.x, p.y, p.z, 0.18, 0.18)) {
        distance = Math.max(0.2, d - 0.25);
        break;
      }
    }
    me.visible = distance > 1.1 && me.userData.target.role !== "waiting";
    camera.position.lerp(
      target.clone().addScaledVector(offset, distance),
      1 - Math.exp(-dt * 16),
    );
    camera.lookAt(target.clone().addScaledVector(aimDirection, 20));
  } else {
    camera.position.set(25, 32, 30);
    camera.lookAt(0, 0, 0);
  }
  const smoky =
    state?.players.find((p) => p.id === myId)?.role === "seeker" &&
    state.smoke.some(
      (s) =>
        Math.hypot(camera.position.x - s.x, camera.position.z - s.z) < 5 &&
        Math.abs(camera.position.y - s.y) < 5,
    );
  scene.fog.near = smoky ? 0 : 35;
  scene.fog.far = smoky ? 3 : 100;
  scene.fog.color.set(smoky ? "#a4afb5" : "#a9d0dc");
  renderer.render(scene, camera);
}
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setSize(innerWidth, innerHeight);
loadMap(0);
requestAnimationFrame(frame);
