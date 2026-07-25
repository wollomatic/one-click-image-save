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
