const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../src/background.js"), "utf8");
const defaultTitle = "Open One Click Image Save options";

function environment(options = {}) {
  const stored = {};
  const items = new Map();
  const badges = new Map();
  const calls = [];
  const logs = [];
  const closedTabs = [];
  const outcomes = [];
  let nextId = 1;
  let existing = false;
  let brokenToolbar = false;
  let optionsOpened = 0;
  function event() {
    const listeners = new Set();
    return {
      listeners,
      addListener(listener) { listeners.add(listener); },
      async emit(...args) { await Promise.all([...listeners].map((listener) => listener(...args))); }
    };
  }
  const downloads = {
    onChanged: event(), onErased: event(),
    async download(value) {
      calls.push(value);
      const outcome = outcomes.shift() || { state: "in_progress" };
      if (outcome.reject) throw new Error(outcome.reject);
      const id = nextId++;
      items.set(id, { id, ...outcome });
      return id;
    },
    async search({ id }) {
      if (id === undefined) return existing ? [{ state: "complete", exists: true }] : [];
      return items.has(id) ? [{ ...items.get(id) }] : [];
    },
    async cancel(id) { Object.assign(items.get(id), { state: "interrupted", error: "USER_CANCELED" }); },
    async erase({ id }) { items.delete(id); }
  };

  function updateBadge({ tabId, ...changes }) {
    if (brokenToolbar) throw new Error("Tab is gone");
    badges.set(tabId, { ...badges.get(tabId), ...changes });
  }
  async function load() {
    downloads.onChanged.listeners.clear();
    downloads.onErased.listeners.clear();
    let menu;
    const browser = {
      runtime: {
        onInstalled: { addListener() {} }, onStartup: { addListener() {} },
        async openOptionsPage() { optionsOpened++; }
      },
      action: {
        onClicked: event(),
        async setBadgeText(value) { updateBadge(value); },
        async setTitle(value) { updateBadge(value); },
        async setBadgeBackgroundColor({ tabId, color }) { updateBadge({ tabId, background: color }); },
        async setBadgeTextColor({ tabId, color }) { updateBadge({ tabId, foreground: color }); }
      },
      contextMenus: {
        onClicked: event(), async remove() {}, create(value) { menu = value; }
      },
      storage: {
        local: { async get(defaults) { return { ...defaults, ...options }; } },
        session: {
          async get() { return structuredClone(stored); },
          async set(values) { Object.assign(stored, structuredClone(values)); },
          async remove(key) { delete stored[key]; }
        },
        onChanged: { addListener() {} }
      },
      tabs: { async remove(id) { closedTabs.push(id); } },
      downloads
    };
    const context = vm.createContext({
      browser, URL, TextEncoder,
      console: { error(...args) { logs.push(args.join(" ")); }, warn() {} },
      PathUtils: require("../src/path-utils"), PrivacyUtils: require("../src/privacy-utils"),
      DownloadUtils: require("../src/download-utils")
    });
    vm.runInContext(source, context);
    await vm.runInContext("menuSetup", context);
    await vm.runInContext("downloadManager.ready", context);
    return {
      menu,
      async click(tabId = 42, srcUrl = "https://cdn.example/image.png") {
        await browser.contextMenus.onClicked.emit({
          menuItemId: "one-click-image-save", srcUrl, pageUrl: "https://example.com/gallery"
        }, { id: tabId });
      },
      async toolbarClick(tabId = 42) { await browser.action.onClicked.emit({ id: tabId }); }
    };
  }
  return {
    stored, items, badges, calls, logs, closedTabs, outcomes, load,
    setExisting(value) { existing = value; },
    breakToolbar() { brokenToolbar = true; },
    get optionsOpened() { return optionsOpened; },
    async change(id, changes) {
      Object.assign(items.get(id), changes);
      await downloads.onChanged.emit({ id, state: { current: items.get(id).state } });
    },
    async erase(id) { items.delete(id); await downloads.onErased.emit(id); }
  };
}

test("menu filters HTTP(S) and image data URLs, including mixed-case MIME types, without new permissions", async () => {
  const page = await environment().load();
  assert.deepEqual(Array.from(page.menu.contexts), ["image"]);
  const patterns = Array.from(page.menu.targetUrlPatterns);
  assert.ok(patterns.includes("http://*/*"));
  assert.ok(patterns.includes("https://*/*"));
  assert.equal(patterns.filter((pattern) => pattern.startsWith("data:")).length, 32);
  assert.ok(patterns.includes("data:image/*"));
  assert.ok(patterns.includes("data:IMAGE/*"));
  assert.ok(patterns.includes("data:ImAgE/*"));
  assert.equal(patterns.some((pattern) => /^(blob|file):/.test(pattern) || pattern === "<all_urls>" || pattern === "data:*"), false);
  const manifest = JSON.parse(fs.readFileSync(require.resolve("../manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["contextMenus", "downloads", "storage"]);
});

test("immediate failures show a red badge and a sanitized explanation only in the source tab", async () => {
  const env = environment({ closeTab: true });
  const page = await env.load();
  env.outcomes.push({ reject: "NETWORK_TIMEOUT https://private.example/image?token=SECRET" });
  await page.click();
  assert.equal(env.badges.get(42).text, "!");
  assert.equal(env.badges.get(42).background, "#b42338");
  assert.match(env.badges.get(42).title, /timed out/);
  assert.equal(JSON.stringify([...env.badges, ...env.logs]).includes("SECRET"), false);
  assert.equal(env.badges.size, 1);
  assert.deepEqual(env.closedTabs, []);
});

test("skipped downloads have neutral feedback and never start a download or close a tab", async () => {
  const env = environment({ conflictAction: "skip", closeTab: true });
  const page = await env.load();
  env.setExisting(true);
  await page.click();
  assert.equal(env.badges.get(42).text, "–");
  assert.equal(env.badges.get(42).background, "#4b5563");
  assert.match(env.badges.get(42).title, /^Skipped:/);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(env.closedTabs, []);
  assert.deepEqual(env.logs, []);
});

test("the next save attempt and toolbar click clear previous feedback", async () => {
  const env = environment();
  const page = await env.load();
  env.outcomes.push({ reject: "NETWORK_FAILED" });
  await page.click();
  assert.equal(env.badges.get(42).text, "!");
  await page.click();
  assert.equal(env.badges.get(42).text, "");
  assert.equal(env.badges.get(42).title, defaultTitle);
  await env.change(1, { state: "interrupted", error: "FILE_NO_SPACE" });
  assert.match(env.badges.get(42).title, /disk space/);
  await page.toolbarClick();
  assert.equal(env.badges.get(42).text, "");
  assert.equal(env.badges.get(42).title, defaultTitle);
  assert.equal(env.optionsOpened, 1);
});

test("interrupted download feedback survives background reload even with automatic closing disabled", async () => {
  const env = environment();
  await (await env.load()).click(73);
  assert.equal(env.stored["pendingDownload:1"].sourceTabId, 73);
  assert.equal(env.stored["pendingDownload:1"].tabId, null);
  env.items.get(1).state = "interrupted";
  env.items.get(1).error = "SERVER_FORBIDDEN";
  await env.load();
  assert.equal(env.badges.get(73).text, "!");
  assert.match(env.badges.get(73).title, /server refused/);
  assert.deepEqual(env.stored, {});
  assert.deepEqual(env.closedTabs, []);
});

test("a successful referrer retry does not display a failure badge", async () => {
  const env = environment({ sendReferer: true, refererMode: "retry" });
  const page = await env.load();
  await page.click();
  env.outcomes.push({ state: "complete" });
  await env.change(1, { state: "interrupted", error: "SERVER_FORBIDDEN" });
  assert.equal(env.calls.length, 2);
  assert.equal(env.badges.get(42).text, "");
  assert.deepEqual(env.logs, []);
  assert.deepEqual(env.stored, {});
});

test("a rejected fallback reports the final failure reason", async () => {
  const env = environment({ sendReferer: true, refererMode: "retry" });
  const page = await env.load();
  await page.click();
  env.outcomes.push({ reject: "FILE_ACCESS_DENIED" });
  await env.change(1, { state: "interrupted", error: "SERVER_FORBIDDEN" });
  assert.equal(env.badges.get(42).text, "!");
  assert.match(env.badges.get(42).title, /could not write/);
  assert.equal(env.logs.length, 1);
  assert.deepEqual(env.stored, {});
});

test("an older successful download does not erase a newer failure badge", async () => {
  const env = environment();
  const page = await env.load();
  await page.click();
  await page.click();
  await env.change(2, { state: "interrupted", error: "SERVER_BAD_CONTENT" });
  await env.change(1, { state: "complete" });
  assert.equal(env.badges.get(42).text, "!");
  await page.click(99);
  assert.equal(env.badges.get(99).text, "");
  assert.equal(env.badges.get(42).text, "!");
});

test("cancellation and history removal use neutral feedback", async () => {
  for (const erase of [false, true]) {
    const env = environment({ closeTab: true });
    await (await env.load()).click();
    if (erase) await env.erase(1);
    else await env.change(1, { state: "interrupted", error: "USER_CANCELED" });
    assert.equal(env.badges.get(42).text, "–");
    assert.match(env.badges.get(42).title, erase ? /removed from history/ : /cancelled/);
    assert.deepEqual(env.logs, []);
    assert.deepEqual(env.closedTabs, []);
  }
});

test("toolbar update failures do not prevent saving or closing a completed download", async () => {
  const env = environment({ closeTab: true });
  const page = await env.load();
  env.breakToolbar();
  env.outcomes.push({ state: "complete" });
  await page.click();
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.closedTabs, [42]);
  assert.deepEqual(env.stored, {});
});
