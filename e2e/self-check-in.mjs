// V2 check: a player marks themselves ("I'm playing") and someone else; a
// second screen (an admin's) shows both, with who marked them, without
// reloading the session (no data requests at all: the live channel carries
// the change). Then everything is put back.
// Defaults to the local dev server (no Cloudflare usage); BASE=<staging> to
// run it there once. Needs the date of a session with check-in open, whose
// ladder includes Test Player's player, and that player's name.
// Usage: node self-check-in.mjs <date> "<my name>" "<other name>" [outDir]
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const envFile = new URL("./.env.staging", import.meta.url);
const localEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^\w+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    )
  : {};
const PASSWORD =
  process.env.TEST_LOGIN_PASSWORD ?? localEnv.TEST_LOGIN_PASSWORD;
const BASE = process.env.BASE ?? "http://localhost:8788";
const [, , date, myName, otherName, outDir] = process.argv;
if (!date || !myName || !otherName) {
  console.error(
    'Usage: node self-check-in.mjs <date> "<my name>" "<other name>" [outDir]',
  );
  process.exit(2);
}
if (outDir) mkdirSync(outDir, { recursive: true });

let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`,
  );
  if (!ok) failed++;
};

const browser = await chromium.launch();
async function open(as, phone) {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width: 1280, height: 900 } },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const r = await page.request.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email: `${as}@staging.invalid`, password: PASSWORD },
    headers: { origin: BASE },
  });
  if (!r.ok()) throw new Error(`sign-in as ${as}: ${r.status()}`);
  await page.goto(`${BASE}/sessions/${date}/checkin`, {
    waitUntil: "networkidle",
  });
  return { page, errors };
}

const player = await open("test-player", true);
// On a failure, a screenshot of both screens shows where it stopped.
process.on("uncaughtException", async (e) => {
  console.error(e.message.split("\n")[0]);
  if (outDir)
    for (const [who, s] of [
      ["player", player],
      ["admin", admin],
    ])
      await s?.page.screenshot({
        path: `${outDir}/failed-${who}.png`,
        fullPage: true,
      });
  process.exit(1);
});
let admin;
admin = await open("test-admin", false);
// Let the admin's live channel connect, then count its data requests.
await admin.page.waitForTimeout(1500);
const adminRequests = [];
admin.page.on("request", (r) => {
  if (["fetch", "xhr", "document"].includes(r.resourceType()))
    adminRequests.push(r.url());
});
// The row whose Player cell starts with the name (another row may say
// "by <name>").
const row = (page, name) =>
  page.getByRole("row").filter({
    has: page.locator("td:nth-child(2)", {
      hasText: new RegExp(`^\\s*${name}`),
    }),
  });
const find = (page, name) => page.getByPlaceholder("Find a player…").fill(name);

// A tap clears the search, and the default "Last played" filter may hide the
// players (made-up ones locally): remove it on both screens.
for (const page of [player.page, admin.page]) {
  const remove = page.getByRole("button", {
    name: /^Remove filter: Last played/,
  });
  if (await remove.isVisible()) await remove.click();
}

// Start clean: nobody of the two marked (a failed run may leave them).
for (const name of [myName, otherName]) {
  await find(player.page, name);
  const on = row(player.page, name).getByRole("button", {
    name: "Attending ✓",
  });
  if (await on.isVisible()) {
    await on.click();
    await row(player.page, name)
      .getByRole("button", { name: "Mark attending" })
      .waitFor({ timeout: 10_000 });
  }
}
await find(player.page, "");
adminRequests.length = 0;

// 1. "I'm playing" on the You card.
const card = player.page.getByText("Are you playing tonight?");
check("player sees the You card", await card.isVisible());
await player.page.getByRole("button", { name: "I’m playing" }).click();
await player.page.getByText("You’re attending ✓").waitFor({ timeout: 10_000 });
check("the card says attending", true);
// 2. Marks someone else from the list.
await find(player.page, otherName);
await row(player.page, otherName)
  .getByRole("button", { name: "Mark attending" })
  .click();
await row(player.page, otherName)
  .getByRole("button", { name: "Attending ✓" })
  .waitFor({ timeout: 10_000 });
const myFirst = myName.split(" ")[0];
check(
  "the player’s phone shows who marked the other player",
  await row(player.page, otherName)
    .getByText(`by ${myName}`)
    .locator("visible=true")
    .first()
    .isVisible(),
);
if (outDir)
  await player.page.screenshot({
    path: `${outDir}/player-phone.png`,
    fullPage: true,
  });

// 3. The admin's screen: both changes, the marker shown, nothing reloaded.
await find(admin.page, otherName);
await row(admin.page, otherName)
  .getByRole("button", { name: "Attending ✓" })
  .waitFor({ timeout: 10_000 });
check("admin sees the other player attending, live", true);
check(
  "admin sees “Marked by” the player",
  await row(admin.page, otherName)
    .getByText(`by ${myName}`)
    .locator("visible=true")
    .first()
    .isVisible(),
);
await find(admin.page, myFirst);
await row(admin.page, myName)
  .getByRole("button", { name: "Attending ✓" })
  .waitFor({ timeout: 10_000 });
check("admin sees the player attending, live", true);
check(
  "a self-mark shows no “by”",
  !(await row(admin.page, myName)
    .getByText(/^by /)
    .locator("visible=true")
    .first()
    .isVisible()),
);
if (outDir)
  await admin.page.screenshot({
    path: `${outDir}/admin-desktop.png`,
    fullPage: true,
  });
check(
  "the admin’s screen made no data requests (no reload)",
  adminRequests.length === 0,
  adminRequests.join(", "),
);

// 4. Put it back: Undo on the card, unmark the other player.
await player.page.getByRole("button", { name: "Undo" }).first().click();
await player.page
  .getByText("Are you playing tonight?")
  .waitFor({ timeout: 10_000 });
await find(player.page, otherName);
await row(player.page, otherName)
  .getByRole("button", { name: "Attending ✓" })
  .click();
await row(player.page, otherName)
  .getByRole("button", { name: "Mark attending" })
  .waitFor({ timeout: 10_000 });
await find(admin.page, otherName);
await row(admin.page, otherName)
  .getByRole("button", { name: "Mark attending" })
  .waitFor({ timeout: 10_000 });
check("unmarking reaches the admin too", true);

for (const [who, s] of [
  ["player", player],
  ["admin", admin],
])
  check(
    `no console errors (${who})`,
    s.errors.length === 0,
    s.errors.join(" | "),
  );
await browser.close();
console.log(failed ? `${failed} FAILED` : "all ok");
process.exit(failed ? 1 : 0);
