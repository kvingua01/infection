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
              socket.on("state", (s) => {
                window.testState = s;
              });
              const emit = socket.emit.bind(socket);
              socket.emit = (event, ...data) => {
                if (event === "throw") window.testThrows.push(data[0]);
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
  assert.match(await seeker.locator("#cooldown").textContent(), /LOCKED/);
  await seeker.mouse.click(550, 375);
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 0);
  // Use the visible button with the mouse released, then keyboard in gameplay.
  await seeker.evaluate(() => document.exitPointerLock());
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
  await seeker.waitForFunction(
    () => window.testState?.phase === "playing",
    null,
    { timeout: 35000 },
  );
  await seeker.mouse.click(550, 375);
  await seeker.waitForFunction(
    () =>
      window.testState.players.find((p) => p.id === window.testSocket.id)
        .cooldown > 2,
  );
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 1);
  await seeker.mouse.click(550, 375);
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 1);
  await seeker.waitForFunction(
    () => document.querySelector("#cooldown").textContent.includes("READY"),
    null,
    { timeout: 6000 },
  );
  await seeker.keyboard.press("KeyV");
  assert.equal(
    await seeker.locator("#cameraMode").getAttribute("aria-pressed"),
    "false",
  );
  await seeker.mouse.click(550, 375);
  await seeker.waitForFunction(
    () =>
      window.testState.players.find((p) => p.id === window.testSocket.id)
        .cooldown > 2,
  );
  assert.equal(await seeker.evaluate(() => window.testThrows.length), 2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: camera button and V toggle, hiding-period lock text, actual first- and third-person mouse throws accepted by server, and cooldown prevents repeat throws. No browser errors.",
  );
} finally {
  await browser.close();
}
