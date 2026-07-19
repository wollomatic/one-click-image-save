const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRefererHeaders,
  safeUrlForLog
} = require("../src/privacy-utils");

test("safeUrlForLog removes credentials, query parameters, and fragments", () => {
  assert.equal(
    safeUrlForLog("https://alice:secret@example.com:8443/private/image.jpg?token=signed#details"),
    "https://example.com:8443/private/image.jpg"
  );
});

test("safeUrlForLog redacts non-HTTP URL payloads", () => {
  assert.equal(safeUrlForLog("javascript:alert('secret')"), "javascript:[redacted]");
  assert.equal(safeUrlForLog("data:text/plain,secret"), "data:[redacted]");
});

test("safeUrlForLog describes invalid values without logging their contents", () => {
  assert.equal(
    safeUrlForLog("not a url?token=secret"),
    "[unparseable URL: type=string, length=22]"
  );
  assert.equal(
    safeUrlForLog(null),
    "[unparseable URL: type=null, length=0]"
  );
});

test("safeUrlForLog limits long paths", () => {
  const logged = safeUrlForLog(`https://example.com/${"a".repeat(120)}?token=secret`);

  assert.equal(logged, `https://example.com/${"a".repeat(79)}...`);
  assert.equal(logged.includes("token"), false);
});

test("buildRefererHeaders is disabled unless explicitly enabled", () => {
  const info = { pageUrl: "https://example.com/gallery" };

  assert.equal(buildRefererHeaders("https://example.com/image.jpg", info), undefined);
  assert.equal(buildRefererHeaders("https://example.com/image.jpg", info, false), undefined);
  assert.equal(buildRefererHeaders("https://example.com/image.jpg", info, "true"), undefined);
});

test("buildRefererHeaders removes secrets from same-origin page URLs", () => {
  assert.deepEqual(
    buildRefererHeaders("https://example.com/image.jpg", {
      frameUrl: "https://alice:secret@example.com/gallery/view?token=signed#image",
      pageUrl: "https://example.com/fallback"
    }, true),
    [{ name: "Referer", value: "https://example.com/gallery/view" }]
  );
});

test("buildRefererHeaders sends only the source origin cross-origin", () => {
  assert.deepEqual(
    buildRefererHeaders("https://cdn.example.net/image.jpg", {
      pageUrl: "https://example.com/gallery/view?token=signed#image"
    }, true),
    [{ name: "Referer", value: "https://example.com/" }]
  );
});

test("buildRefererHeaders rejects HTTPS-to-HTTP downgrades and non-HTTP URLs", () => {
  assert.equal(
    buildRefererHeaders(
      "http://cdn.example.net/image.jpg",
      { pageUrl: "https://example.com/gallery" },
      true
    ),
    undefined
  );
  assert.equal(
    buildRefererHeaders(
      "data:image/png;base64,AAAA",
      { pageUrl: "https://example.com/gallery" },
      true
    ),
    undefined
  );
});
