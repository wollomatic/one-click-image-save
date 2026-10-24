const assert = require("node:assert/strict");
const test = require("node:test");
const { createDownloadManager } = require("../src/download-utils");

const primary = { url: "https://cdn.example/image.png", filename: "Images/image.png" };
const fallback = { ...primary, headers: [{ name: "Referer", value: "https://example.com/" }] };

function environment() {
  const stored = {};
  const items = new Map();
  const calls = [];
  const erased = [];
  const outcomes = [];
  let nextId = 1;
  function event() {
    const listeners = new Set();
    return {
      listeners,
      addListener(listener) { listeners.add(listener); },
      async emit(value) { await Promise.all([...listeners].map((listener) => listener(value))); }
    };
  }
  const session = {
    async get() { return structuredClone(stored); },
    async set(values) { Object.assign(stored, structuredClone(values)); },
    async remove(key) { delete stored[key]; }
  };
  const downloads = {
    onChanged: event(),
    onErased: event(),
    async download(options) {
      calls.push(options);
      const outcome = outcomes.shift() || { state: "in_progress" };
      if (outcome.reject) throw new Error(outcome.reject);
      const id = nextId++;
      items.set(id, { id, ...outcome });
      return id;
    },
    async search({ id }) { return items.has(id) ? [{ ...items.get(id) }] : []; },
    async erase({ id }) { erased.push(id); items.delete(id); },
    async cancel(id) { items.set(id, { id, state: "interrupted", error: "USER_CANCELED" }); }
  };
  function load() {
    const completed = [];
    const errors = [];
    const revoked = [];
    const manager = createDownloadManager(downloads, session, {
      onComplete(record) { completed.push(record); },
      onError() { errors.push("failed"); },
      revokeObjectURL(url) { revoked.push(url); }
    });
    return { manager, completed, errors, revoked };
  }
  function unload() {
    downloads.onChanged.listeners.clear();
    downloads.onErased.listeners.clear();
  }
  async function change(id, properties) {
    Object.assign(items.get(id), properties);
    await downloads.onChanged.emit({ id, state: { current: items.get(id).state } });
  }
  return { stored, items, outcomes, calls, erased, session, downloads, load, unload, change };
}

test("listeners are installed synchronously and completion survives an unloaded event page", async () => {
  const env = environment();
  const first = env.load();
  assert.equal(env.downloads.onChanged.listeners.size, 1);
  assert.equal(env.downloads.onErased.listeners.size, 1);
  await first.manager.start(primary, fallback, { tabId: 42 });
  assert.equal(env.stored["pendingDownload:1"].tabId, 42);

  env.unload();
  const restored = env.load();
  await env.change(1, { state: "complete" });
  assert.deepEqual(first.completed, []);
  assert.equal(restored.completed.length, 1);
  assert.equal(restored.completed[0].tabId, 42);
  assert.deepEqual(env.stored, {});
  await env.downloads.onChanged.emit({ id: 1, state: { current: "complete" } });
  assert.equal(restored.completed.length, 1);
});

test("recovery handles downloads completed or erased while the background page was absent", async () => {
  for (const missing of [false, true]) {
    const env = environment();
    await env.load().manager.start(primary, null, { tabId: 42 });
    env.unload();
    if (missing) env.items.delete(1);
    else env.items.get(1).state = "complete";
    const restored = env.load();
    await restored.manager.ready;
    assert.equal(restored.completed.length, missing ? 0 : 1);
    assert.equal(restored.errors.length, missing ? 1 : 0);
    assert.deepEqual(env.stored, {});
  }
});

test("pausing keeps download state and blob URL until resumed completion, including after reload", async () => {
  const env = environment();
  const first = env.load();
  await first.manager.start({ url: "blob:test" }, null, { tabId: 42, objectUrl: "blob:test" });
  await env.change(1, { state: "interrupted", paused: true, error: "USER_CANCELED" });
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.revoked, []);
  assert.ok(env.stored["pendingDownload:1"]);

  env.unload();
  const restored = env.load();
  await restored.manager.ready;
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(restored.revoked, []);
  await env.change(1, { state: "in_progress", paused: false, error: null });
  await env.change(1, { state: "complete" });
  assert.equal(restored.completed[0].tabId, 42);
  assert.deepEqual(restored.revoked, ["blob:test"]);
  assert.deepEqual(env.stored, {});
});

test("cancelling a paused download or erasing its history releases resources without closing a tab", async () => {
  for (const erase of [false, true]) {
    const env = environment();
    const page = env.load();
    await page.manager.start({ url: "blob:test" }, null, { tabId: 42, objectUrl: "blob:test" });
    await env.change(1, { state: "interrupted", paused: true, error: "USER_CANCELED" });
    if (erase) {
      env.items.delete(1);
      await env.downloads.onErased.emit(1);
    } else {
      await env.change(1, { state: "interrupted", paused: false });
    }
    assert.deepEqual(page.completed, []);
    assert.deepEqual(page.revoked, ["blob:test"]);
    assert.equal(page.errors.length, 1);
    assert.deepEqual(env.stored, {});
  }
});

test("referrer retry survives suspension and retries only once", async () => {
  const env = environment();
  await env.load().manager.start(primary, fallback, { tabId: 42 });
  env.unload();
  const restored = env.load();
  await env.change(1, { state: "interrupted", error: "SERVER_FORBIDDEN" });
  assert.deepEqual(env.calls, [primary, fallback]);
  assert.deepEqual(env.erased, [1]);
  assert.equal(env.stored["pendingDownload:2"].fallbackOptions, null);
  await env.change(2, { state: "interrupted", error: "SERVER_UNAUTHORIZED" });
  assert.equal(env.calls.length, 2);
  assert.equal(restored.errors.length, 1);
  assert.deepEqual(restored.completed, []);
  assert.deepEqual(env.stored, {});
});

test("immediate API rejection can retry with a referrer and preserve tab completion", async () => {
  const env = environment();
  env.outcomes.push({ reject: "Download failed: SERVER_UNAUTHORIZED" }, { state: "complete" });
  const page = env.load();
  await page.manager.start(primary, fallback, { tabId: 42 });
  assert.deepEqual(env.calls, [primary, fallback]);
  assert.deepEqual(env.erased, []);
  assert.equal(page.completed[0].tabId, 42);
  assert.deepEqual(env.stored, {});
});

test("unrelated failures and erased downloads do not trigger referrer retries", async () => {
  for (const erase of [false, true]) {
    const env = environment();
    const page = env.load();
    await page.manager.start(primary, fallback);
    if (erase) {
      env.items.delete(1);
      await env.downloads.onErased.emit(1);
    } else {
      await env.change(1, { state: "interrupted", error: "NETWORK_TIMEOUT" });
    }
    assert.deepEqual(env.calls, [primary]);
    assert.equal(page.errors.length, 1);
    assert.deepEqual(env.stored, {});
  }
});

test("a failed fallback releases state without closing the source tab", async () => {
  const env = environment();
  env.outcomes.push({ state: "interrupted", error: "SERVER_FORBIDDEN" }, { reject: "NETWORK_FAILED" });
  const page = env.load();
  await page.manager.start(primary, fallback, { tabId: 42 });
  assert.equal(page.errors.length, 1);
  assert.deepEqual(page.completed, []);
  assert.deepEqual(env.stored, {});
});

test("a search failure preserves pending state for a later completion event", async () => {
  const env = environment();
  const search = env.downloads.search;
  env.downloads.search = async () => { throw new Error("Search failed"); };
  const page = env.load();
  await page.manager.start({ url: "blob:test" }, null, { tabId: 42, objectUrl: "blob:test" });
  assert.ok(env.stored["pendingDownload:1"]);
  assert.deepEqual(page.revoked, []);
  env.downloads.search = search;
  await env.change(1, { state: "complete" });
  assert.equal(page.completed.length, 1);
  assert.deepEqual(page.revoked, ["blob:test"]);
});

test("one failed recovery lookup does not block completion handling for other downloads", async () => {
  const env = environment();
  const page = env.load();
  await page.manager.start(primary, null, { tabId: 1 });
  await page.manager.start(primary, null, { tabId: 2 });
  env.unload();
  env.items.get(2).state = "complete";
  const search = env.downloads.search;
  env.downloads.search = async (query) => {
    if (query.id === 1) throw new Error("Search failed");
    return search(query);
  };
  const restored = env.load();
  await restored.manager.ready;
  assert.deepEqual(restored.completed.map((record) => record.tabId), [2]);
  assert.ok(env.stored["pendingDownload:1"]);
  assert.equal(env.stored["pendingDownload:2"], undefined);
});

test("concurrent completions keep their own tabs and ignore unrelated download events", async () => {
  const env = environment();
  env.stored.unrelated = "keep";
  const page = env.load();
  await Promise.all([
    page.manager.start(primary, null, { tabId: 1 }),
    page.manager.start(primary, null, { tabId: 2 })
  ]);
  await env.downloads.onChanged.emit({ id: 99, state: { current: "complete" } });
  await Promise.all([env.change(2, { state: "complete" }), env.change(1, { state: "complete" })]);
  assert.deepEqual(page.completed.map((record) => record.tabId), [2, 1]);
  assert.deepEqual(env.stored, { unrelated: "keep" });
});

test("a storage failure cancels an untracked download and does not block later downloads", async () => {
  const env = environment();
  const page = env.load();
  const set = env.session.set;
  env.session.set = async () => { throw new Error("Write failed"); };
  await assert.rejects(page.manager.start(primary, null, { tabId: 42 }), /Write failed/);
  assert.equal(env.items.get(1).error, "USER_CANCELED");
  assert.deepEqual(page.completed, []);
  env.session.set = set;
  env.outcomes.push({ state: "complete" });
  await page.manager.start(primary, null, { tabId: 43 });
  assert.equal(page.completed[0].tabId, 43);
});
