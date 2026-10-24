const assert = require("node:assert/strict");
const test = require("node:test");

const {
  interruptReason,
  isRetryableRefererError,
  normalizeRefererMode,
  prepareDownloadUrl,
  shouldUseBrowserFilename
} = require("../src/download-utils");

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

test("interrupt reasons are classified without exposing error details", () => {
  assert.equal(interruptReason(new Error("Failure: SERVER_FORBIDDEN")), "SERVER_FORBIDDEN");
  assert.equal(interruptReason(new Error("arbitrary details")), "UNKNOWN");
  assert.equal(isRetryableRefererError("SERVER_FORBIDDEN"), true);
  assert.equal(isRetryableRefererError("SERVER_UNAUTHORIZED"), true);
  assert.equal(isRetryableRefererError("SERVER_FAILED"), false);
});
