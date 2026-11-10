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
const errors = [],
  contexts = [],
  url = process.argv[2] || "http://127.0.0.1:3000";
const until = (page, predicate) =>
  page.waitForFunction(predicate, null, { polling: 100 });
async function player(name) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 720 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // This suite tests lobby DOM and live networking. Full WebGL rendering is
  // exercised separately in browser-smoke.js; four software renderers can
  // exhaust a headless worker before its menu loads.
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  contexts.push(context);
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.fill("#nickname", name);
  return p;
}
try {
  const a = await player("Public host"),
    b = await player("Public friend");
  await a.fill("#lobbyName", "Browser public");
  await a.click("#createPublic");
  await a.locator("#waitingRoom").waitFor({ state: "visible" });
  assert(await a.locator("#startGame").isDisabled());
  await b.click("#browsePublic");
  await b
    .locator(".lobby-row")
    .filter({ hasText: "Browser public" })
    .getByRole("button", { name: "Join", exact: true })
    .click();
  await until(a, () => !document.querySelector("#startGame").disabled);
  assert(await b.locator("#startGame").isHidden());
  const c = await player("Private host"),
    d = await player("Private friend");
  await c.fill("#lobbyName", "Browser private");
  await c.click("#createPrivate");
  await c.locator("#privateRoomCode").waitFor({ state: "visible" });
  const code = await c.locator("#shareCode").inputValue();
  assert.match(code, /^[A-Z0-9]{6}$/);
  await c.click("#copyCode");
  assert.equal(await c.evaluate(() => navigator.clipboard.readText()), code);
  await d.click("#browsePublic");
  assert.equal(await d.locator(".lobby-row").count(), 1);
  assert(
    !(await d.locator("#publicList").textContent()).includes("Browser private"),
  );
  await d.click("#browsePrivate");
  await d.fill("#privateCode", "!!!!!!");
  await d.click("#joinPrivate");
  await until(d, () =>
    document.querySelector("#connection").textContent.includes("valid"),
  );
  await d.fill("#privateCode", code.toLowerCase());
  assert.equal(await d.locator("#privateCode").inputValue(), code);
  await d.click("#joinPrivate");
  await d.locator("#waitingRoom").waitFor({ state: "visible" });
  await a.click("#startGame");
  await c.click("#startGame");
  for (const p of [a, b, c, d])
    await p.locator("#waitingRoom").waitFor({ state: "hidden" });
  await b.evaluate(() => document.exitPointerLock());
  await b.click("#lobbyInfo");
  assert((await b.locator("#roomCount").textContent()).includes("Public host"));
  assert(
    !(await b.locator("#roomPlayers").textContent()).includes("Private host"),
  );
  await contexts[0].close();
  await until(b, () =>
    document
      .querySelector("#roomCount")
      .textContent.includes("Host: Public friend"),
  );
  await b.click("#leaveRoom");
  await b.locator("#join").waitFor({ state: "visible" });
  await b.click("#browsePublic");
  await until(b, () => document.querySelectorAll(".lobby-row").length === 0);
  await c.evaluate(() => document.exitPointerLock());
  await c.click("#lobbyInfo");
  await c.click("#leaveRoom");
  await d.evaluate(() => document.exitPointerLock());
  await d.click("#lobbyInfo");
  await d.click("#leaveRoom");
  await d.click("#browsePrivate");
  await d.fill("#privateCode", code);
  await d.click("#joinPrivate");
  await until(d, () =>
    document.querySelector("#connection").textContent.includes("expired"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: public/private menus across four browser sessions, live listing, code copy/uppercase/errors, host start, two simultaneous games, isolated rosters, host transfer, leaving and expired codes. No browser errors.",
  );
} catch (error) {
  for (const context of contexts)
    for (const page of context.pages())
      console.log(
        "Lobby UI error status:",
        await page
          .locator("#connection")
          .textContent({ timeout: 1000 })
          .catch(() => ""),
      );
  throw error;
} finally {
  await browser.close();
}
