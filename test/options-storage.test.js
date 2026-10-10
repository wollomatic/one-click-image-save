const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../src/options.js"), "utf8");
const flush = () => new Promise(setImmediate);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function loadOptions(saved = {}) {
  const stored = { ...saved };
  const calls = [];
  const hooks = {};
  const timers = new Map();
  const elements = new Map();
  const errors = [];
  let nextTimer = 1;
  let confirmation = true;

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        value: "",
        checked: false,
        disabled: false,
        textContent: "",
        hidden: false,
        addEventListener() {},
        showModal() {}
      });
    }
    return elements.get(selector);
  }

  const conflicts = ["uniquify", "overwrite", "skip"].map((value) => ({ ...element(value), value }));
  const modes = ["retry", "always"].map((value) => ({ ...element(value), value }));
  const context = vm.createContext({
    PathUtils: require("../src/path-utils"),
    document: {
      querySelector: element,
      querySelectorAll(selector) {
        return selector.includes("conflictAction") ? conflicts : modes;
      }
    },
    console: { error(...args) { errors.push(args); } },
    confirm: () => confirmation,
    setTimeout(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    browser: {
      runtime: { getManifest() { return { version: "1.1.2" }; } },
      storage: {
        local: {
          async get(defaults) {
            calls.push({ method: "get" });
            return defaults === null ? { ...stored } : { ...defaults, ...stored };
          },
          async set(values) {
            calls.push({ method: "set", values: { ...values } });
            await hooks.set?.(values);
            Object.assign(stored, values);
          },
          async remove(keys) {
            calls.push({ method: "remove", keys: [...keys] });
            await hooks.remove?.(keys);
            for (const key of keys) delete stored[key];
          },
          async clear() {
            calls.push({ method: "clear" });
            await hooks.clear?.();
            for (const key of Object.keys(stored)) delete stored[key];
          }
        }
      }
    }
  });
  vm.runInContext(source, context);
  await flush();
  return {
    context, stored, calls, hooks, timers, elements, errors,
    setConfirmation(value) { confirmation = value; },
    writes() { return calls.filter((call) => call.method !== "get"); }
  };
}

test("rapid autosaves keep the latest snapshot and never run storage writes concurrently", async () => {
  const page = await loadOptions();
  const blocked = deferred();
  page.hooks.set = async (values) => {
    if (values.prefixDomain === true) await blocked.promise;
  };
  page.elements.get("#prefix-domain").checked = true;
  const first = page.context.saveOptions();
  page.elements.get("#prefix-domain").checked = false;
  page.elements.get("#prefix-timestamp").checked = true;
  const latest = page.context.saveOptions();
  await flush();
  assert.equal(page.writes().length, 1);
  blocked.resolve();
  await Promise.all([first, latest]);
  assert.deepEqual(page.stored, { prefixTimestamp: true });
});

test("autosave writes nondefaults before removing only keys restored to defaults", async () => {
  const page = await loadOptions({ prefixDomain: true, targetFolder: "Images", unrelated: "keep" });
  await page.context.saveChangedOptions({
    ...page.context.getOptions(), prefixDomain: false, prefixTimestamp: true
  });
  assert.deepEqual(page.stored, {
    targetFolder: "Images", prefixTimestamp: true, unrelated: "keep"
  });
  const [set, remove] = page.writes();
  assert.equal(set.method, "set");
  assert.equal(remove.method, "remove");
  assert.ok(remove.keys.includes("prefixDomain"));
  assert.equal(remove.keys.includes("prefixTimestamp"), false);
  assert.equal(remove.keys.includes("targetFolder"), false);
  assert.equal(remove.keys.includes("unrelated"), false);
});

test("a failed save preserves existing options and does not block later saves", async () => {
  const page = await loadOptions({ prefixDomain: true });
  const writing = deferred();
  let fail = true;
  page.hooks.set = async () => {
    if (fail) {
      fail = false;
      throw new Error("Write failed");
    }
    await writing.promise;
  };
  const first = page.context.saveChangedOptions({
    ...page.context.getOptions(), prefixDomain: false, prefixTimestamp: true
  });
  const latest = page.context.saveChangedOptions({
    ...page.context.getOptions(), prefixDomain: false, closeTab: true
  });
  await assert.rejects(first, /Write failed/);
  assert.deepEqual(page.stored, { prefixDomain: true });
  writing.resolve();
  await latest;
  assert.deepEqual(page.stored, { closeTab: true });
});

test("reset waits for queued writes, cancels timers and suppresses saves until options are reloaded", async () => {
  const page = await loadOptions({ prefixDomain: true, unrelated: "delete" });
  const writing = deferred();
  const clearing = deferred();
  page.hooks.set = async (values) => {
    if (values.prefixDomain === true) await writing.promise;
  };
  page.hooks.clear = async () => { await clearing.promise; };
  const first = page.context.saveOptions();
  page.elements.get("#prefix-domain").checked = false;
  page.elements.get("#prefix-timestamp").checked = true;
  const latest = page.context.saveOptions();
  page.context.scheduleSave();
  assert.ok([...page.timers.values()].some((timer) => timer.delay === 350));
  const reset = page.context.deleteSavedSettings();
  await page.context.saveOptions();
  await page.context.saveChangedOptions({ prefixDomain: true });
  page.context.scheduleSave();
  await page.context.deleteSavedSettings();
  assert.equal([...page.timers.values()].some((timer) => timer.delay === 350), false);
  await flush();
  assert.equal(page.writes().some((call) => call.method === "clear"), false);
  writing.resolve();
  await Promise.all([first, latest]);
  await flush();
  assert.equal(page.writes().at(-1).method, "clear");
  assert.equal(page.writes().filter((call) => call.method === "clear").length, 1);
  await page.context.saveOptions();
  clearing.resolve();
  await reset;
  assert.deepEqual(page.stored, {});
  assert.equal(page.elements.get("#prefix-domain").checked, false);
  assert.equal(page.elements.get("#prefix-timestamp").checked, false);
  assert.equal(page.elements.get("#status").textContent, "Saved settings removed.");
  assert.equal(page.elements.get("#settings-content").hidden, true);

  page.elements.get("#close-tab").checked = true;
  await page.context.saveOptions();
  assert.deepEqual(page.stored, { closeTab: true });
});

test("declining a reset leaves stored settings and scheduled autosave intact", async () => {
  const page = await loadOptions({ prefixDomain: true });
  page.context.scheduleSave();
  page.setConfirmation(false);
  await page.context.deleteSavedSettings();
  assert.deepEqual(page.stored, { prefixDomain: true });
  assert.deepEqual(page.writes(), []);
  const [id, timer] = [...page.timers].find(([, value]) => value.delay === 350);
  page.timers.delete(id);
  await timer.callback();
  assert.deepEqual(page.stored, { prefixDomain: true });
});

test("reset survives an earlier save failure and failed resets allow further autosave", async () => {
  for (const clearFails of [false, true]) {
    const page = await loadOptions({ prefixDomain: true });
    page.hooks.set = async () => { throw new Error("Write failed"); };
    page.hooks.clear = async () => {
      if (clearFails) throw new Error("Clear failed");
    };
    const saving = page.context.saveOptions();
    const reset = page.context.deleteSavedSettings();
    await Promise.all([saving, reset]);
    assert.equal(page.elements.get("#status").textContent, clearFails
      ? "Could not remove saved settings." : "Saved settings removed.");
    delete page.hooks.set;
    page.elements.get("#prefix-domain").checked = false;
    page.elements.get("#close-tab").checked = true;
    await page.context.saveOptions();
    assert.deepEqual(page.stored, { closeTab: true });
  }
});
