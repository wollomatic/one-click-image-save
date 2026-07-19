const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRefererHeaders
} = require("../src/privacy-utils");

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
