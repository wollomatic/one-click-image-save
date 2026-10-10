const assert = require("node:assert/strict");
const test = require("node:test");

const {
  downloadWithRefererFallback,
  interruptReason,
  isRetryableRefererError,
  normalizeRefererMode,
  prepareDownloadUrl,
  shouldUseBrowserFilename
} = require("../src/download-utils");

function fakeDownloads(outcomes) {
  const items = new Map();
  const listeners = new Set();
  const calls = [];
  const erased = [];
  let nextId = 1;

  return {
    calls,
    erased,
    onErased: { addListener() {}, removeListener() {} },
    onChanged: {
      addListener(listener) {
        listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      }
    },
    async download(options) {
      calls.push(options);
      const outcome = outcomes.shift();

      if (outcome.reject) {
        throw new Error(outcome.reject);
      }

      const id = nextId++;
      items.set(id, {
        id,
        state: outcome.success ? "complete" : "interrupted",
        error: outcome.error
      });
      return id;
    },
    async search({ id }) {
      const item = items.get(id);
      return item ? [item] : [];
    },
    async erase({ id }) {
      erased.push(id);
      return [id];
    }
  };
}

test("normalizeRefererMode accepts only supported values", () => {
  assert.equal(normalizeRefererMode("retry"), "retry");
  assert.equal(normalizeRefererMode("always"), "always");
  assert.equal(normalizeRefererMode("invalid"), "retry");
  assert.equal(normalizeRefererMode(undefined), "retry");
});

test("browser filename is used only for uncomplicated HTTP downloads", () => {
  const defaults = {
    targetFolder: "",
    domainSubfolder: false,
    prefixDomain: false,
    prefixTimestamp: false,
    conflictAction: "uniquify"
  };

  assert.equal(shouldUseBrowserFilename("https://example.com/image", defaults), true);
  assert.equal(shouldUseBrowserFilename("data:image/png;base64,AAAA", defaults), false);
  assert.equal(shouldUseBrowserFilename("https://example.com/image", {
    ...defaults,
    targetFolder: "Saved Images"
  }), false);
  assert.equal(shouldUseBrowserFilename("https://example.com/image", {
    ...defaults,
    conflictAction: "skip"
  }), false);
});

test("data images are downloaded through a temporary object URL", async () => {
  const blob = { type: "image/jpeg" };
  const fetchCalls = [];
  const revoked = [];
  const urlApi = {
    createObjectURL(value) {
      assert.equal(value, blob);
      return "blob:extension-image";
    },
    revokeObjectURL(value) {
      revoked.push(value);
    }
  };
  const fetchFn = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      async blob() {
        return blob;
      }
    };
  };

  const prepared = await prepareDownloadUrl("data:image/jpeg;base64,/9j/4AAQ", fetchFn, urlApi);

  assert.equal(prepared.url, "blob:extension-image");
  assert.deepEqual(fetchCalls, ["data:image/jpeg;base64,/9j/4AAQ"]);
  prepared.revoke();
  prepared.revoke();
  assert.deepEqual(revoked, ["blob:extension-image"]);
});

test("non-data URLs keep their original download URL", async () => {
  const prepared = await prepareDownloadUrl("https://example.com/image.jpg");

  assert.equal(prepared.url, "https://example.com/image.jpg");
  prepared.revoke();
});

test("referer fallback retries one rejected download and removes its history entry", async () => {
  const downloads = fakeDownloads([
    { success: false, error: "SERVER_FORBIDDEN" },
    { success: true }
  ]);
  const primary = { url: "https://cdn.example/image.jpg" };
  const fallback = {
    ...primary,
    headers: [{ name: "Referer", value: "https://example.com/" }]
  };

  const result = await downloadWithRefererFallback(downloads, primary, fallback);

  assert.equal(result.success, true);
  assert.deepEqual(downloads.calls, [primary, fallback]);
  assert.deepEqual(downloads.erased, [1]);
});

test("referer fallback does not retry unrelated failures", async () => {
  const downloads = fakeDownloads([
    { success: false, error: "NETWORK_TIMEOUT" }
  ]);
  const primary = { url: "https://cdn.example/image.jpg" };
  const fallback = {
    ...primary,
    headers: [{ name: "Referer", value: "https://example.com/" }]
  };

  const result = await downloadWithRefererFallback(downloads, primary, fallback);

  assert.equal(result.success, false);
  assert.equal(result.error, "NETWORK_TIMEOUT");
  assert.deepEqual(downloads.calls, [primary]);
  assert.deepEqual(downloads.erased, []);
});

test("referer fallback handles immediate API rejection reasons", async () => {
  const downloads = fakeDownloads([
    { reject: "Download failed: SERVER_UNAUTHORIZED" },
    { success: true }
  ]);

  const result = await downloadWithRefererFallback(
    downloads,
    { url: "https://cdn.example/image.jpg" },
    {
      url: "https://cdn.example/image.jpg",
      headers: [{ name: "Referer", value: "https://example.com/" }]
    }
  );

  assert.equal(result.success, true);
  assert.equal(downloads.calls.length, 2);
  assert.deepEqual(downloads.erased, []);
});

test("interrupt reasons are classified without exposing error details", () => {
  assert.equal(interruptReason(new Error("Failure: SERVER_FORBIDDEN")), "SERVER_FORBIDDEN");
  assert.equal(interruptReason(new Error("arbitrary details")), "UNKNOWN");
  assert.equal(isRetryableRefererError("SERVER_FORBIDDEN"), true);
  assert.equal(isRetryableRefererError("SERVER_UNAUTHORIZED"), true);
  assert.equal(isRetryableRefererError("SERVER_FAILED"), false);
});

function pendingDownload(item = { id: 7, state: "in_progress" }) {
  const changed = new Set();
  const erased = new Set();
  const calls = [];
  return {
    item,
    changed,
    erased,
    calls,
    onChanged: {
      addListener(listener) { changed.add(listener); },
      removeListener(listener) { changed.delete(listener); }
    },
    onErased: {
      addListener(listener) { erased.add(listener); },
      removeListener(listener) { erased.delete(listener); }
    },
    async download(options) { calls.push(options); return 7; },
    async search() { return this.item ? [this.item] : []; }
  };
}

function assertListenersRemoved(downloads) {
  assert.equal(downloads.changed.size, 0);
  assert.equal(downloads.erased.size, 0);
}

test("missing download history entries fail without a referrer retry", async () => {
  const downloads = pendingDownload(null);
  const result = await downloadWithRefererFallback(downloads, { url: "https://example.com/image.png" }, {
    url: "https://example.com/image.png",
    headers: [{ name: "Referer", value: "https://example.com/" }]
  });
  assert.deepEqual(result, { success: false, id: 7, error: "UNKNOWN" });
  assert.equal(downloads.calls.length, 1);
  assertListenersRemoved(downloads);
});

test("erasing a pending download releases listeners and ignores a late search result", async () => {
  const downloads = pendingDownload();
  let resolveSearch;
  downloads.search = () => new Promise((resolve) => { resolveSearch = resolve; });
  const waiting = downloadWithRefererFallback(downloads, { url: "https://example.com/image.png" }, {
    url: "https://example.com/image.png",
    headers: [{ name: "Referer", value: "https://example.com/" }]
  });
  await new Promise(setImmediate);
  const [handleErased] = downloads.erased;
  handleErased(8);
  assert.equal(downloads.changed.size, 1);
  handleErased(7);
  assert.deepEqual(await waiting, { success: false, id: 7, error: "UNKNOWN" });
  resolveSearch([{ id: 7, state: "complete" }]);
  await new Promise(setImmediate);
  assert.equal(downloads.calls.length, 1);
  assertListenersRemoved(downloads);
});

test("concurrent complete and erased events keep the first terminal result", async () => {
  for (const erasedFirst of [false, true]) {
    const downloads = pendingDownload();
    const waiting = downloadWithRefererFallback(downloads, { url: "https://example.com/image.png" }, null);
    await new Promise(setImmediate);
    const [handleChanged] = downloads.changed;
    const [handleErased] = downloads.erased;
    if (erasedFirst) {
      handleErased(7);
      handleChanged({ id: 7, state: { current: "complete" } });
    } else {
      handleChanged({ id: 7, state: { current: "complete" } });
      handleErased(7);
    }
    assert.deepEqual(await waiting, {
      success: !erasedFirst, id: 7, error: erasedFirst ? "UNKNOWN" : null
    });
    assertListenersRemoved(downloads);
  }
});

test("an interrupted download that disappears does not retry its stale referrer error", async () => {
  const downloads = pendingDownload();
  const waiting = downloadWithRefererFallback(downloads, { url: "https://example.com/image.png" }, {
    url: "https://example.com/image.png",
    headers: [{ name: "Referer", value: "https://example.com/" }]
  });
  await new Promise(setImmediate);
  downloads.item = null;
  const [handleChanged] = downloads.changed;
  handleChanged({
    id: 7, error: { current: "SERVER_FORBIDDEN" }, state: { current: "interrupted" }
  });
  assert.deepEqual(await waiting, { success: false, id: 7, error: "UNKNOWN" });
  assert.equal(downloads.calls.length, 1);
  assertListenersRemoved(downloads);
});

test("download search failures and already-complete downloads release both listeners", async () => {
  for (const searchFails of [false, true]) {
    const downloads = pendingDownload({ id: 7, state: "complete" });
    if (searchFails) {
      downloads.search = async () => { throw new Error("Search failed"); };
    }
    const result = await downloadWithRefererFallback(downloads, { url: "https://example.com/image.png" }, null);
    assert.deepEqual(result, {
      success: !searchFails, id: 7, error: searchFails ? "UNKNOWN" : null
    });
    assertListenersRemoved(downloads);
  }
});
