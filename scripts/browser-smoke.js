// npm start first, then npm run test:browser against an otherwise empty service.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const pages = [],
  errors = [];
const binding = (page, name) => page.locator("#controlList button").and(page.getByRole("button", { name: new RegExp("^" + name + " ·") }));
async function rebind(page, name, key) {
  const button = binding(page, name);
  await button.click();
  assert.equal(await button.textContent(), "Press any key...");
  await page.keyboard.press(key);
}

try {
  for (let n = 0; n < 2; n++) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 750 },
    });
    await context.addInitScript(() => {
      Object.defineProperty(window, "io", {
        configurable: true,
        set(original) {
          Object.defineProperty(window, "io", {
            configurable: true,
            value: (...args) => {
              const socket = original(...args);
              window.testSocket = socket;
              window.testThrows = [];
              window.testUses = [];
              window.testInputs = [];
              socket.on("state", (s) => {
                window.testState = s;
              });
              const emit = socket.emit.bind(socket);
              socket.emit = (event, ...data) => {
                if (event === "throw") window.testThrows.push(data[0]);
                if (event === "use") window.testUses.push(data[0]);
                if (event === "input") window.testInputs.push(data[0]);
                return emit(event, ...data);
              };
              return socket;
            },
          });
        },
      });
    });
    const page = await context.newPage();
    pages.push(page);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.argv[2] || "http://127.0.0.1:3000");
    if (n === 0) {
      await page.setViewportSize({ width: 390, height: 650 });
      await page.click("#menuSettings");
      assert.equal(await page.locator("#controlList button").count(), 12);
      await rebind(page, "Move Forward", "KeyS");
      assert.match(await page.locator("#settingsStatus").textContent(), /Move Backward/);
      await page.click("#cancelBinding");
      assert.equal(await binding(page, "Move Forward").textContent(), "W");
      await rebind(page, "Move Forward", "KeyS");
      await page.click("#swapBinding");
      assert.equal(await binding(page, "Move Forward").textContent(), "S");
      assert.equal(await binding(page, "Move Backward").textContent(), "W");
      await page.click("#resetBindings");
      assert.equal(await binding(page, "Move Forward").textContent(), "W");
      await rebind(page, "Move Forward", "ArrowUp");
      await page.click("#saveBindings");
      assert.equal(await page.locator("#settingsStatus").textContent(), "Settings saved.");
      await page.reload();
      await page.click("#menuSettings");
      assert.equal(await binding(page, "Move Forward").textContent(), "Arrow Up");
      await binding(page, "Jump").click();
      await page.keyboard.press("Escape");
      assert(await page.locator("#settings").isVisible());
      assert.equal(await binding(page, "Jump").textContent(), "Space");
      await page.click("#closeSettings");
      await page.setViewportSize({ width: 1100, height: 750 });
    }
    await page.fill("#nickname", "Camera check " + n);
    if (n === 0) {
      await page.fill("#lobbyName", "Camera regression");
      await page.click("#createPublic");
    } else {
      await page.click("#browsePublic");
      await page
        .locator(".lobby-row")
        .filter({ hasText: "Camera regression" })
        .getByRole("button", { name: "Join", exact: true })
        .click();
    }
  }
  await pages[0].waitForFunction(
    () => !document.querySelector("#startGame").disabled,
  );
  await pages[0].click("#startGame");
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.testState?.phase==="hiding")));
  const roles = await Promise.all(
    pages.map((p) => p.locator("#role").textContent()),
  );
  const seeker = pages[roles.indexOf("SEEKER")];
  assert(seeker, "Exactly one browser should be seeker");
  const other = pages.find((page) => page !== seeker);
  await other.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await seeker.bringToFront();
  assert.match(await seeker.locator("#cooldown").textContent(), /LOCKED/);
  // The visible camera button can be used before the canvas takes pointer lock.
  await seeker.locator("#cameraMode").click();
  assert.equal(
    await seeker.locator("#cameraMode").getAttribute("aria-pressed"),
    "true",
  );
  await seeker.keyboard.press("KeyV");
  assert.equal(
    await seeker.locator("#cameraMode").getAttribute("aria-pressed"),
    "false",
  );
  await seeker.keyboard.press("KeyV");
  assert.equal(
    await seeker.locator("#cameraMode").getAttribute("aria-pressed"),
    "true",
  );
  await seeker.mouse.click(550, 375);
  await seeker.waitForFunction(() => document.pointerLockElement?.id === "world");
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 0);
  await seeker.keyboard.press("Escape");
  await seeker.locator("#settings").waitFor({ state: "visible" });
  await seeker.waitForFunction(() => document.pointerLockElement === null);
  const remaining = await seeker.evaluate(() => window.testState.remaining);
  for (const [action, key] of [
    ["Move Forward", "ArrowUp"], ["Move Backward", "ArrowDown"],
    ["Move Left", "ArrowLeft"], ["Move Right", "ArrowRight"],
    ["Jump", "KeyJ"], ["Select Power-up Slot 1", "Digit3"],
    ["Select Power-up Slot 2", "Digit4"], ["Activate Power-up", "KeyG"],
    ["Switch Camera", "KeyC"], ["Show Scores", "KeyB"],
    ["Open Settings", "KeyO"],
  ]) await rebind(seeker, action, key);
  await binding(seeker, "Throw Projectile").click();
  await seeker.mouse.click(550, 375, { button: "right" });
  assert.equal(await binding(seeker, "Throw Projectile").textContent(), "Right Mouse");
  await seeker.click("#saveBindings");
  await seeker.evaluate(() => window.testInputs.length = 0);
  await seeker.keyboard.down("ArrowUp");
  await seeker.keyboard.press("KeyJ");
  await seeker.keyboard.press("KeyG");
  await seeker.waitForFunction((t) => window.testState.remaining < t - 0.25, remaining);
  await seeker.waitForFunction(() => window.testInputs.length > 0);
  assert(await seeker.evaluate(() =>
    window.testInputs.every(({ x, z, jump }) => !x && !z && !jump) &&
    window.testUses.length === 0,
  ));
  await seeker.click("#closeSettings");
  await seeker.keyboard.up("ArrowUp");
  for (const [key, axis, sign] of [
    ["ArrowUp", "z", -1], ["ArrowDown", "z", 1],
    ["ArrowLeft", "x", -1], ["ArrowRight", "x", 1],
  ]) {
    await seeker.evaluate(() => window.testInputs.length = 0);
    await seeker.keyboard.down(key);
    await seeker.waitForFunction(({ axis, sign }) => window.testInputs.some(
      (input) => input[axis] * sign > 0.5,
    ), { axis, sign });
    await seeker.keyboard.up(key);
  }
  await seeker.keyboard.press("KeyJ");
  await seeker.waitForFunction(() => window.testInputs.some((input) => input.jump));
  await seeker.keyboard.down("ArrowUp");
  await seeker.waitForFunction(() => window.testInputs.at(-1)?.z < -0.5);
  await seeker.evaluate(() => window.dispatchEvent(new Event("blur")));
  await seeker.waitForFunction(() => window.testInputs.at(-1)?.z === 0);
  await seeker.keyboard.up("ArrowUp");
  await seeker.keyboard.press("Digit4");
  await seeker.keyboard.press("KeyG");
  assert.deepEqual(await seeker.evaluate(() => window.testUses), [1]);
  await seeker.keyboard.press("Digit3");
  await seeker.keyboard.press("KeyG");
  assert.deepEqual(await seeker.evaluate(() => window.testUses), [1, 0]);
  await seeker.keyboard.down("KeyB");
  await seeker.locator("#scores").waitFor({ state: "visible" });
  await seeker.keyboard.up("KeyB");
  await seeker.locator("#scores").waitFor({ state: "hidden" });
  await seeker.keyboard.press("KeyO");
  await seeker.locator("#settings").waitFor({ state: "visible" });
  await seeker.keyboard.press("Escape");
  await seeker.locator("#settings").waitFor({ state: "hidden" });
  await seeker.waitForFunction(
    () => window.testState?.phase === "playing",
    null,
    { timeout: 35000 },
  );
  await seeker.mouse.click(550, 375);
  await seeker.waitForFunction(() => document.pointerLockElement?.id === "world");
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 0);
  await seeker.mouse.click(550, 375, { button: "right" });
  await seeker.waitForFunction(
    () =>
      window.testState.players.find((p) => p.id === window.testSocket.id)
        .cooldown > 0,
  );
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 1);
  await seeker.mouse.click(550, 375, { button: "right" });
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 1);
  await seeker.waitForFunction(
    () => document.querySelector("#cooldown").textContent.includes("READY"),
    null,
    { timeout: 6000 },
  );
  await seeker.keyboard.press("KeyC");
  assert.equal(
    await seeker.locator("#cameraMode").getAttribute("aria-pressed"),
    "false",
  );
  await seeker.mouse.click(550, 375, { button: "right" });
  await seeker.waitForFunction(
    () =>
      window.testState.players.find((p) => p.id === window.testSocket.id)
        .cooldown > 0,
  );
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 2);
  // Left click can open Settings while the Back to Game button restores lock.
  await seeker.keyboard.press("KeyO");
  await seeker.locator("#settings").waitFor({ state: "visible" });
  await binding(seeker, "Open Settings").click();
  await seeker.mouse.click(550, 375);
  assert.equal(await binding(seeker, "Open Settings").textContent(), "Left Mouse");
  await seeker.click("#saveBindings");
  await seeker.click("#closeSettings");
  await seeker.waitForFunction(() => document.pointerLockElement?.id === "world");
  await seeker.mouse.click(550, 375);
  await seeker.locator("#settings").waitFor({ state: "visible" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: settings persistence, duplicate swap/cancel, live round timing, all rebound inputs, pointer-lock release, and server-accepted right-click throws in both camera modes. No browser errors.",
  );
} finally {
  await browser.close();
}
