export const names = [
  "Giant House",
  "School",
  "Forest & Cabins",
  "Shopping Mall",
  "Warehouse",
  "Amusement Park",
];
export function createMap(index) {
  const blocks = [],
    labels = [],
    spawns = [];
  const box = (x, y, z, w, h, d, color = "#a58666") =>
    blocks.push({ x, y, z, w, h, d, color });
  const label = (text, x, y, z) => labels.push({ text, x, y, z });
  box(
    0,
    -0.5,
    0,
    64,
    1,
    64,
    ["#749965", "#c1b695", "#527b44", "#acafb8", "#8b9299", "#77a267"][index],
  );
  for (const [x, z, w, d] of [
    [-32, 0, 1, 65],
    [32, 0, 1, 65],
    [0, -32, 65, 1],
    [0, 32, 65, 1],
  ])
    box(x, 4, z, w, 8, d, "#46596b");
  const stairs = (x, z, dir = 1) => {
    for (let n = 0; n < 10; n++)
      box(x, 0.2 * (n + 1), z + n * dir, 3, 0.4 * (n + 1), 1, "#a5a8aa");
  };
  const room = (x, z, title, color = "#bc9976") => {
    box(x, 2, z - 6, 12, 4, 0.5, color);
    box(x - 6, 2, z, 0.5, 4, 12, color);
    box(x + 6, 2, z, 0.5, 4, 12, color);
    box(x - 4, 2, z + 6, 4, 4, 0.5, color);
    box(x + 4, 2, z + 6, 4, 4, 0.5, color);
    label(title, x, 4, z);
  };
  const furniture = (x, z, color = "#866347") => {
    box(x, 0.7, z, 3, 1.4, 2, color);
  };
  if (index === 0) {
    for (const [x, z, t] of [
      [-17, -17, "BEDROOM"],
      [0, -17, "CLOSET"],
      [17, -17, "LIBRARY"],
      [-17, 10, "KITCHEN"],
      [17, 10, "BASEMENT"],
    ]) {
      room(x, z, t);
      furniture(x - 3, z);
      furniture(x + 3, z - 3);
    }
    box(0, 4, 10, 12, 0.5, 15, "#b48b65");
    stairs(-4, -5);
    label("ATTIC", 0, 7, 10);
    box(3, 5.3, 10, 3, 2, 4, "#80634a");
    box(-24, 0.5, 25, 8, 1, 3);
  }
  if (index === 1) {
    for (const x of [-20, 0, 20])
      for (const z of [-17, 8]) {
        room(
          x,
          z,
          z < 0
            ? "CLASSROOM"
            : x === 0
              ? "CAFETERIA"
              : x < 0
                ? "LIBRARY"
                : "GYM",
          "#b6bbaf",
        );
        for (let n = -3; n <= 3; n += 3) furniture(x + n, z);
      }
    for (let x = -25; x < 27; x += 3) box(x, 1.5, 27, 2, 3, 1, "#5a8caa");
    label("LOCKERS", 0, 4, 27);
    box(0, 2, -1, 22, 0.6, 2, "#83929c");
    stairs(10, -12);
  }
  if (index === 2) {
    for (let n = 0; n < 35; n++) {
      const x = ((n * 17) % 57) - 28,
        z = ((n * 23) % 57) - 28;
      if (Math.abs(x) < 4 && Math.abs(z) < 5) continue;
      box(x, 2, z, 1.3, 4, 1.3, "#725034");
      box(x, 5, z, 5, 3, 5, "#346645");
    }
    room(-16, -17, "CABIN", "#8e6544");
    room(18, 15, "CABIN", "#8e6544");
    for (let n = 0; n < 5; n++)
      box(-22 + n * 3, 1 + n * 0.3, 12, 3, 2 + n * 0.6, 5, "#737c83");
    box(0, 3, 20, 14, 1, 9, "#777f83");
    box(-6, 1, 20, 2, 3, 9, "#777f83");
    box(6, 1, 20, 2, 3, 9, "#777f83");
    label("CAVE", 0, 5, 20);
    stairs(12, -10);
    box(12, 4, 3, 6, 0.5, 8, "#99754f");
  }
  if (index === 3) {
    for (const x of [-20, 20])
      for (const z of [-18, 0, 18]) {
        room(
          x,
          z,
          z < 0 ? "SHOP" : z === 0 ? "STORAGE" : "FOOD COURT",
          "#aba2bb",
        );
        furniture(x, z, "#c98287");
      }
    box(0, 4, 0, 12, 0.5, 30, "#c4bda7");
    stairs(-4, -24);
    for (const z of [-8, 8]) {
      furniture(-3, z);
      furniture(3, z);
    }
    label("UPPER GALLERY", 0, 7, 0);
  }
  if (index === 4) {
    for (let x = -24; x <= 24; x += 12)
      for (let z = -24; z <= 24; z += 12) {
        box(x, 1.5, z, 6, 3, 6, "#ac7d43");
        if ((x + z) % 24 === 0) box(x, 4, z, 4, 2, 4, "#c29658");
      }
    for (const x of [-17, 17]) {
      box(x, 1.7, 3, 5, 3.4, 15, "#528e9c");
      box(x, 4, 3, 7, 0.5, 17, "#6c7783");
    }
    stairs(17, -14);
    label("FREIGHT / 04", 0, 7, -24);
  }
  if (index === 5) {
    for (const [x, z, t] of [
      [-20, -20, "ARCADE"],
      [20, -20, "TICKETS"],
      [-20, 18, "MAINTENANCE"],
      [20, 18, "PRIZES"],
    ]) {
      room(x, z, t, "#bf7598");
      furniture(x, z, "#e0ad59");
    }
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      box(
        Math.cos(a) * 10,
        1.5,
        Math.sin(a) * 10,
        2,
        3,
        2,
        ["#d16b79", "#e7bb57", "#6baec0"][n % 3],
      );
    }
    box(0, 4, 0, 6, 1, 6, "#b57bd2");
    stairs(0, -12);
    label("BLOCK CARNIVAL", 0, 8, 0);
  }
  if (index === 1) {
    stairs(-10, 14);
    box(0, 4.15, 25, 24, 0.3, 3, "#87949c");
    box(0, 6.5, 25, 24, 0.3, 3, "#87949c");
    box(0, 5.3, 26.5, 24, 2.2, 0.3, "#7c8b94");
    box(2, 5.3, 23.5, 20, 2.2, 0.3, "#7c8b94");
    label("VENT ACCESS", -10, 7, 23);
  }
  if (index === 4) {
    box(17, 4.15, 16, 3, 0.3, 10, "#87949c");
    box(17, 6.5, 16, 3, 0.3, 10, "#87949c");
    for (const x of [15.5, 18.5]) box(x, 5.3, 16, 0.3, 2.2, 10, "#7c8b94");
    label("VENT SHAFT", 17, 7, 17);
  }
  if (index === 5) {
    box(-17, 3, 0, 1, 6, 1, "#eac45c");
    box(-17, 6, 0, 1, 1, 1, "#eac45c");
    for (let n = 0; n < 20; n++) {
      const a = (n * Math.PI) / 10;
      box(-17 + Math.cos(a) * 5, 6 + Math.sin(a) * 5, 0, 1, 1, 1, "#eeae56");
      if (n % 4 === 0)
        box(
          -17 + Math.cos(a) * 5,
          5 + Math.sin(a) * 5,
          0,
          1.5,
          1,
          2,
          "#cf729c",
        );
    }
    label("SKY WHEEL", -17, 13, 0);
    for (let n = 0; n < 4; n++) {
      box(
        -24 + n * 2.5,
        1.1,
        -20,
        1.5,
        2.2,
        1.5,
        ["#6abcc5", "#c478b5", "#e6b65c", "#749ee6"][n],
      );
      box(-24 + n * 2.5, 1.6, -19.2, 1, 0.6, 0.1, "#293e58");
    }
  }
  // Walkable below-ground rooms, with a staircase connecting to the arena.
  if (index === 0 || index === 2) {
    blocks.shift();
    const ground = ["#749965", "#c1b695", "#527b44"][index];
    box(-7, -0.5, 0, 50, 1, 64, ground);
    box(27, -0.5, 0, 10, 1, 64, ground);
    box(20, -0.5, -6, 4, 1, 52, ground);
    box(20, -0.5, 30, 4, 1, 4, ground);
    box(20, -4.5, 24, 4, 1, 8, "#74777c");
    for (let n = 0; n < 10; n++)
      box(20, -4 + (n * 0.4) / 2, 20 + n * 0.8, 4, n * 0.4, 0.8, "#8b9195");
    box(17.75, -2, 25, 0.5, 4, 6, "#767b83");
    box(22.25, -2, 24, 0.5, 4, 8, "#767b83");
    box(20, -2, 19.75, 4, 4, 0.5, "#767b83");
    box(4, -4.5, 21, 32, 1, 3, "#757b80");
    box(4, -2.5, 19.25, 32, 3, 0.5, "#65717c");
    box(4, -2.5, 22.75, 32, 3, 0.5, "#65717c");
    box(-12, -2.5, 21, 0.5, 3, 4, "#65717c");
    box(-8, -4.5, 15, 4, 1, 12, "#757b80");
    box(-10.25, -2.5, 15, 0.5, 3, 12, "#65717c");
    box(-5.75, -2.5, 15, 0.5, 3, 12, "#65717c");
    box(-8, -2.5, 8.75, 5, 3, 0.5, "#65717c");
    // A gap in the tunnel's inner wall joins the secret branch.
    const tunnelWall = blocks.findIndex((b) => b.x === 4 && b.z === 19.25);
    blocks.splice(tunnelWall, 1);
    box(-11, -2.5, 19.25, 2, 3, 0.5, "#65717c");
    box(7, -2.5, 19.25, 26, 3, 0.5, "#65717c");
    label(index === 0 ? "BASEMENT STAIRS" : "CAVE DESCENT", 20, 2, 29);
  }
  // An enclosed isolation room outside the arena is used only during hiding.
  box(45, -0.5, 0, 10, 1, 10, "#29384d");
  for (const [x, z, w, d] of [
    [40, 0, 0.5, 10],
    [50, 0, 0.5, 10],
    [45, -5, 10, 0.5],
    [45, 5, 10, 0.5],
  ])
    box(x, 3, z, w, 6, d, "#29384d");
  box(45, 6, 0, 10, 0.5, 10, "#29384d");
  const clear = (x, z) =>
    !blocks.some(
      (b) =>
        b.y + b.h / 2 > 0.1 &&
        b.y - b.h / 2 < 2 &&
        Math.abs(x - b.x) < b.w / 2 + 0.6 &&
        Math.abs(z - b.z) < b.d / 2 + 0.6,
    );
  for (let x = -28; x <= 28; x += 4)
    for (let z = -28; z <= 28; z += 4)
      if (
        clear(x, z) &&
        blocks.some(
          (b) =>
            Math.abs(x - b.x) < b.w / 2 &&
            Math.abs(z - b.z) < b.d / 2 &&
            Math.abs(b.y + b.h / 2) < 0.1,
        )
      )
        spawns.push({ x, y: 0, z });
  return {
    index,
    name: names[index],
    blocks,
    labels,
    spawns,
    release: spawns.reduce((a, b) =>
      Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b,
    ),
  };
}
export function overlap(x, y, z, b, r = 0.38, h = 1.8) {
  return (
    x + r > b.x - b.w / 2 &&
    x - r < b.x + b.w / 2 &&
    y + h > b.y - b.h / 2 + 0.001 &&
    y < b.y + b.h / 2 - 0.001 &&
    z + r > b.z - b.d / 2 &&
    z - r < b.z + b.d / 2
  );
}
export function solid(map, x, y, z, r = 0.38, h = 1.8) {
  return map.blocks.some((b) => overlap(x, y, z, b, r, h));
}
