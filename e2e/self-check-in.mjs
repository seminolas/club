// V2 check: a player marks themselves (type and Enter) and someone else (the
// Attending switch), then unmarks them; a second screen (an admin's) shows
// each change and who made it (the "Marked by" column, history on a tap),
// without reloading the session (no data requests at all: the live channel
// carries the change). Also the "Marked by: Me" filter.
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
// The row whose Player cell starts with the name.
const row = (page, name) =>
  page.getByRole("row").filter({
    has: page.locator("td:nth-child(2)", {
      hasText: new RegExp(`^\\s*${name}`),
    }),
  });
const search = (page) => page.getByPlaceholder("Find a player…");
const find = (page, name) => search(page).fill(name);
const attending = (page, name) => row(page, name).getByRole("switch");
/** Taps a row's switch (its input is visually hidden: tap the track). */
const tap = (page, name) =>
  row(page, name).locator(".mantine-Switch-track").click();
/** Waits until a row's switch is on (or off). */
const waitSwitch = (page, name, on) =>
  page.waitForFunction(
    ([n, want]) =>
      [...document.querySelectorAll("tr")].some(
        (tr) =>
          tr
            .querySelector("td:nth-child(2)")
            ?.textContent?.trim()
            .startsWith(n) &&
          tr.querySelector('input[role="switch"]')?.checked === want,
      ),
    [name, on],
    { timeout: 10_000 },
  );

// The default "Last played" filter may hide the players (made-up ones
// locally): remove it on both screens.
for (const page of [player.page, admin.page]) {
  const remove = page.getByRole("button", {
    name: /^Remove filter: Last played/,
  });
  if (await remove.isVisible()) await remove.click();
}

// Start clean: nobody of the two marked (a failed run may leave them).
for (const name of [myName, otherName]) {
  await find(player.page, name);
  if (await attending(player.page, name).isChecked()) {
    await tap(player.page, name);
    await waitSwitch(player.page, name, false);
  }
}
await find(player.page, "");
adminRequests.length = 0;

// Marked by says who by their short name: preferred, else first name (a
// clash adds an initial, so match the start).
const ladder = (await (await fetch(`${BASE}/api/leaderboard`)).json()).players;
const mine = ladder.find((p) => p.name === myName);
const myShort = mine?.preferred_name ?? myName.split(" ")[0];
/** The row's "Marked by" (a button opening the history). */
const markedBy = (page, name) =>
  row(page, name).getByRole("button", { name: /^Check-in history/ });
const markedBySays = async (page, name, text) =>
  ((await markedBy(page, name).textContent()) ?? "").startsWith(text);

// 1. Type my name and Enter: marked, and the row stays in view with the
// search selected (typing the next name replaces it).
await find(player.page, myName);
await search(player.page).press("Enter");
await waitSwitch(player.page, myName, true);
check(
  "Enter marks me; the search stays, selected",
  (await search(player.page).inputValue()) === myName &&
    (await search(player.page).evaluate(
      (el) => el.selectionStart === 0 && el.selectionEnd === el.value.length,
    )),
);
check(
  "Marked by: me",
  await markedBySays(player.page, myName, myShort),
  await markedBy(player.page, myName).textContent(),
);
// 2. Marks someone else with their switch.
await search(player.page).pressSequentially(otherName);
check(
  "typing replaced the search",
  (await search(player.page).inputValue()) === otherName,
);
await tap(player.page, otherName);
await waitSwitch(player.page, otherName, true);
check(
  "Marked by on the player’s phone: who marked them",
  await markedBySays(player.page, otherName, myShort),
);
if (outDir)
  await player.page.screenshot({
    path: `${outDir}/player-phone.png`,
    fullPage: true,
  });

// 3. The admin's screen: both changes, who marked them, nothing reloaded.
await find(admin.page, otherName);
await waitSwitch(admin.page, otherName, true);
check("admin sees the other player attending, live", true);
check(
  "admin sees who marked them",
  await markedBySays(admin.page, otherName, myShort),
);
await find(admin.page, myName);
await waitSwitch(admin.page, myName, true);
check("admin sees the player attending, live", true);
check(
  "a self-mark shows the same",
  await markedBySays(admin.page, myName, myShort),
);
if (outDir)
  await admin.page.screenshot({
    path: `${outDir}/admin-desktop.png`,
    fullPage: true,
  });

// 4. The player unmarks the other player: the admin sees it, and tapping
// Marked by shows the history, newest first.
await find(player.page, otherName);
await tap(player.page, otherName);
await waitSwitch(player.page, otherName, false);
await find(admin.page, otherName);
await waitSwitch(admin.page, otherName, false);
check("unmarking reaches the admin too", true);
await markedBy(admin.page, otherName).click();
const dropdown = admin.page.locator(".mantine-Popover-dropdown");
await dropdown.waitFor({ timeout: 5_000 });
const lines = await dropdown.locator("p").allTextContents();
check(
  "tapping Marked by shows the history, newest first",
  lines[0]?.startsWith(`Unmarked by ${myShort}`) &&
    lines[1]?.startsWith(`Marked by ${myShort}`),
  lines.join(" / "),
);
if (outDir)
  await admin.page.screenshot({
    path: `${outDir}/admin-history.png`,
    fullPage: true,
  });
check(
  "the admin’s screen made no data requests (no reload)",
  adminRequests.length === 0,
  adminRequests.join(", "),
);

// 5. "Marked by: Me" on the player's phone: exactly the two I changed.
await find(player.page, "");
await player.page.getByRole("button", { name: "Filters", exact: true }).click();
await player.page.getByRole("checkbox", { name: /^Me\b/ }).check();
await player.page.getByRole("button", { name: /^Show \d+ players?$/ }).click();
await player.page
  .getByRole("button", { name: "Remove filter: Marked by me" })
  .waitFor({ timeout: 5_000 });
// Rows as [player, marked by] (earlier runs may have marked others too).
const shown = await player.page
  .locator("tbody tr")
  .evaluateAll((trs) =>
    trs.map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()),
    ),
  );
check(
  "Marked by: Me shows the players I changed, and only them",
  [myName, otherName].every((n) => shown.some((r) => r[1].startsWith(n))) &&
    shown.every((r) => r.at(-1).startsWith(myShort)),
  shown.map((r) => `${r[1]} by ${r.at(-1)}`).join(", "),
);
if (outDir)
  await player.page.screenshot({
    path: `${outDir}/player-marked-by-me.png`,
    fullPage: true,
  });
await player.page
  .getByRole("button", { name: "Remove filter: Marked by me" })
  .click();

// 6. Put me back: my switch off.
await find(player.page, myName);
await tap(player.page, myName);
await waitSwitch(player.page, myName, false);

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
