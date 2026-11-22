import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../server.js";
import { Game } from "../shared/game.js";
import { Lobbies } from "../shared/lobbies.js";

const lobbies = new Lobbies({
  gameFactory: () => new Game({ autoStart: false, hide: 0, random: () => 0, hunterSpawnChance: 0 }),
});
const { io, server } = createGameServer({ lobbies });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const friend = connect(url);

try {
  const page = await browser.newPage({ viewport: { width: 850, height: 640 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // The regular browser smoke suite exercises WebGL rendering. Skip GPU
    // draw calls here while keeping the live camera, raycasting and input loop.
    for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"])
      WebGL2RenderingContext.prototype[method] = () => {};
    window.gamepadState = { id: "Xbox Series X Controller", buttons: [], axes: [0, 0, 0, 0] };
    window.samples = 0;
    navigator.getGamepads = () => {
      window.samples++;
      const { id, buttons, axes } = window.gamepadState;
      return id ? [{
        id, index: 0, mapping: "standard", connected: true, axes,
        buttons: Array.from({ length: 17 }, (_, index) => ({
          pressed: buttons.includes(index), value: Number(buttons.includes(index)),
        })),
        vibrationActuator: {
          playEffect() { window.rumbles = (window.rumbles || 0) + 1; return Promise.resolve(); },
        },
      }] : [];
    };
  });
  await page.goto(url);
  const wait = (test, value) => page.waitForFunction(test, value, { polling: 50 });
  const text = (selector) => page.locator(selector).textContent();
  const focus = () => page.evaluate(() => document.activeElement.id);
  async function sample(changes) {
    const count = await page.evaluate((data) => {
      Object.assign(window.gamepadState, data);
      return window.samples;
    }, changes);
    await wait((before) => window.samples > before, count);
  }
  async function press(button) {
    await sample({ buttons: [button] });
    await sample({ buttons: [] });
  }
  async function highlight(id) {
    for (let attempt = 0; attempt < 60 && (await focus()) !== id; attempt++) await press(13);
    assert.equal(await focus(), id);
  }
  await page.locator("#controllerBanner").waitFor({ state: "visible" });
  assert.match(await text("#controllerBanner"), /Controller Connected · A select/);
  await highlight("openGuide");
  await press(0);
  await page.locator("#advancedGuide").waitFor({ state: "visible" });
  assert.equal(await page.locator("#guideContent dt").count(), 10);
  await sample({ axes: [0, 0, 0, 1] });
  await wait(() => document.querySelector("#guideContent").scrollTop > 0);
  await sample({ axes: [0, 0, 0, 0] });
  await press(1);
  await page.locator("#advancedGuide").waitFor({ state: "hidden" });
  await highlight("nickname");
  // Only virtual controller input is used for the menu, text entry and first round.
  await press(0);
  await page.locator("#screenKeyboard").waitFor({ state: "visible" });
  await press(0);
  for (let attempt = 0; attempt < 8 && (await focus()) !== "keyboardDone"; attempt++) await press(13);
  await highlight("keyboardDone");
  await press(0);
  assert.equal(await page.inputValue("#nickname"), "a");

  console.log("Controller: nickname entered using the on-screen keyboard.");
  await press(9);
  await highlight("controllerTab");
  await press(0);
  assert.match(await text("#controllerName"), /Xbox Series X/);
  await highlight("customizeController");
  await press(0);
  await press(13); // Jump is the first binding.
  await press(0);
  await press(2); // Already used by Activate Power-Up.
  assert.match(await text("#controllerSettingsStatus"), /already assigned to Activate Power-Up/);
  await press(0); // Explicit swap.
  await highlight("saveBindings");
  await press(0);
  assert.equal(await text("#settingsStatus"), "Settings saved.");
  await press(1);
  await page.reload();
  await wait(() => document.querySelector("#controllerBanner").hidden === false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.infectionController).buttons.jump), 2);
  await press(0);
  await press(0);
  await highlight("keyboardDone");
  await press(0);
  console.log("Controller: revised bindings saved across reload.");
  await highlight("createPrivate");
  await press(0);
  await page.locator("#shareCode").waitFor({ state: "visible" });
  if (!friend.connected) await once(friend, "connect");
  const joined = await friend.timeout(3000).emitWithAck("joinPrivate", {
    code: await page.inputValue("#shareCode"), nickname: "Keyboard friend",
  });
  assert(!joined.error, joined.error);
  await highlight("startGame");
  await press(0);
  await page.locator("#waitingRoom").waitFor({ state: "hidden" });
  console.log("Controller: private lobby created and started using only the gamepad.");
  const game = [...lobbies.rooms.values()][0].game;
  const hunter = [...game.players.values()][0];
  const hider = game.players.get(friend.id);
  assert.equal(hunter.role, "seeker");
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function serverUntil(predicate) {
    for (let i = 0; i < 120 && !predicate(); i++) await delay(25);
    assert(predicate());
  }
  await serverUntil(() => game.phase === "playing");
  await sample({ axes: [0.5, -0.5, 0.65, 0] });
  await serverUntil(() => Math.hypot(hunter.input.x, hunter.input.z) > 0.3 && Math.abs(hunter.yaw) > 0.05);
  assert(Math.hypot(hunter.input.x, hunter.input.z) < 0.9);
  await sample({ axes: [0, 0, 0, 0] });
  await serverUntil(() => !hunter.input.x && !hunter.input.z);
  const yaw = hunter.yaw;
  await delay(180);
  assert.equal(hunter.yaw, yaw);
  await sample({ buttons: [2] });
  await serverUntil(() => hunter.input.jump);
  await sample({ buttons: [] });
  await press(7);
  await serverUntil(() => hunter.cooldown > game.time);
  assert.equal(await page.evaluate(() => window.rumbles), 1);
  hunter.hunterItem = "vision";
  await press(0);
  await serverUntil(() => hunter.hunterItem === null && game.visionUntil > game.time);

  // The same controller bindings route hider slot selection and use.
  hunter.role = "hider";
  hider.role = "seeker";
  hunter.inventory = ["invisibility", "jump"];
  await press(15);
  await press(0);
  await serverUntil(() => hunter.effects.jump > game.time);
  assert.deepEqual(hunter.inventory, ["invisibility"]);

  await sample({ id: null });
  await wait(() => document.querySelector("#controlHints").textContent.includes("Mouse look"));
  await sample({ id: "DualSense Wireless Controller (Vendor: 054c)" });
  await press(3);
  assert.match(await text("#controlHints"), /Square jump.*R2 throw/);
  await page.keyboard.press("KeyV");
  assert.match(await text("#controlHints"), /Space jump.*Left Mouse throw/);
  await press(1);
  await page.locator("#waitingRoom").waitFor({ state: "visible" });
  await highlight("leaveRoom");
  await press(0);
  await page.locator("#join").waitFor({ state: "visible" });
  await highlight("browsePrivate");
  await press(0);
  await press(0);
  await page.locator("#screenKeyboard").waitFor({ state: "visible" });
  await press(0); // A is the first private-code key.
  await highlight("keyboardDone");
  await press(0);
  assert.equal(await page.inputValue("#privateCode"), "A");
  assert.deepEqual(errors, []);
  console.log("PASS: simulated Xbox and DualSense, controller-only menus and text entry, saved swaps, analog movement and aiming, remapped jump, throw, vibration and inventory in a mixed-input lobby.");
} finally {
  friend.disconnect();
  await browser.close();
  await new Promise((resolve) => io.close(resolve));
}
