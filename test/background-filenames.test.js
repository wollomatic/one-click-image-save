const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(
  require.resolve("../src/background.js"),
  "utf8"
);
const TIMESTAMP = "2026-10-10_12-34-56";

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [2026, 9, 10, 12, 34, 56]));
  }
}

async function loadBackground(options = {}) {
  const downloadCalls = [];
  const listeners = {};
  const browser = {
    runtime: {
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} }
    },
    action: { onClicked: { addListener() {} } },
    storage: {
      local: { async get(defaults) { return { ...defaults, ...options }; } },
      onChanged: { addListener() {} }
    },
    contextMenus: {
      async remove() {},
      create() {},
      onClicked: { addListener(listener) { listeners.clicked = listener; } }
    },
    downloads: {
      async download(downloadOptions) {
        downloadCalls.push(downloadOptions);
        return downloadCalls.length;
      },
      async search({ id }) { return [{ id, state: "complete" }]; },
      onChanged: { addListener() {}, removeListener() {} },
      onErased: { addListener() {}, removeListener() {} }
    }
  };
  const context = vm.createContext({
    browser,
    console,
    Date: FixedDate,
    URL,
    TextEncoder,
    PathUtils: require("../src/path-utils"),
    PrivacyUtils: require("../src/privacy-utils"),
    DownloadUtils: require("../src/download-utils")
  });

  vm.runInContext(backgroundSource, context);
  await vm.runInContext("menuSetup", context);
  return { context, downloadCalls, listeners };
}

test("CDN suffixes are removed from filenames without changing signed download URLs", async () => {
  for (const targetFolder of ["Saved Images", ""]) {
    const { downloadCalls, listeners } = await loadBackground({ targetFolder });
    const cases = [
      ["photo.png:large", "photo.png"],
      ["photo.PNG%3Aorig", "photo.PNG"],
      ["photo.webp:4096x4096", "photo.webp"]
    ];
    for (const [path, expectedName] of cases) {
      const url = "https://cdn.example/" + path + "?signature=a%2Fb%2Bc&expires=123#image";
      await listeners.clicked({
        menuItemId: "one-click-image-save",
        srcUrl: url,
        pageUrl: "https://example.com/gallery"
      }, { id: 1 });

      const call = downloadCalls.at(-1);
      assert.equal(call.url, url);
      assert.equal(call.filename, [targetFolder, expectedName].filter(Boolean).join("/"));
      assert.equal(call.saveAs, false);
    }
  }
});

test("data images use MIME-based names without including image payloads", async () => {
  const { context } = await loadBackground();
  const cases = [
    ["data:image/png;base64,SECRET_PAYLOAD", "image-" + TIMESTAMP + ".png"],
    ["data:image/jpeg;base64,SECRET_PAYLOAD", "image-" + TIMESTAMP + ".jpg"],
    ["data:image/svg+xml,%3Csvg%3ESECRET_PAYLOAD%3C/svg%3E", "image-" + TIMESTAMP + ".svg"],
    ["DATA:IMAGE/X-PNG;BASE64,SECRET_PAYLOAD", "image-" + TIMESTAMP + ".png"],
    ["data:image/vnd.adobe.photoshop;base64,SECRET_PAYLOAD", "image-" + TIMESTAMP],
    ["data:image/unknown,SECRET_PAYLOAD", "image-" + TIMESTAMP]
  ];

  for (const [url, expected] of cases) {
    assert.equal(context.buildDownloadFilename(url, {}, { targetFolder: "" }), expected);
  }
});

test("complete filenames fit 180 UTF-8 bytes with both prefixes and intact image extensions", async () => {
  const { context } = await loadBackground();
  for (const character of ["a", "\u00e4", "\u732b", "\u{1f431}"]) {
    for (const extension of [".png", ".JPEG", ".svg"]) {
      const filename = context.buildDownloadFilename(
        "https://cdn.example/" + encodeURIComponent(character.repeat(200)) + extension,
        { pageUrl: "https://www.example.com/gallery" },
        { targetFolder: "Saved Images", prefixDomain: true, prefixTimestamp: true }
      );
      const basename = filename.slice("Saved Images/".length);
      const prefix = "example_com-" + TIMESTAMP + "-";
      assert.ok(filename.startsWith("Saved Images/" + prefix));
      assert.ok(Buffer.byteLength(basename, "utf8") <= 180);
      assert.ok(basename.endsWith(extension));
      const stem = basename.slice(prefix.length, -extension.length);
      assert.ok(stem.length > 0);
      assert.equal(Array.from(stem).every((value) => value === character), true);
    }
  }
});

test("unknown data MIME types remain extensionless when long prefixes are truncated", async () => {
  const { context } = await loadBackground();
  const filename = context.buildDownloadFilename(
    "data:image/unknown;base64,SECRET_PAYLOAD",
    { pageUrl: "https://" + "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(63) + ".example.com/" },
    { targetFolder: "", prefixDomain: true, completeHostname: true, prefixTimestamp: true }
  );
  assert.ok(Buffer.byteLength(filename, "utf8") <= 180);
  assert.equal(filename.includes("SECRET_PAYLOAD"), false);
  assert.equal(filename.includes(".jpg"), false);
});

test("normal filenames and format parameters retain their existing behavior", async () => {
  const { context, downloadCalls, listeners } = await loadBackground({ targetFolder: "" });
  const cases = [
    ["https://example.com/photo.JPG?format=auto", "photo.JPG"],
    ["https://example.com/photo.jpg?format=webp", "photo.webp"],
    ["https://example.com/photo?fm=avif", "photo.avif"],
    ["https://example.com/photo.png:large?format=webp", "photo.webp"],
    ["https://example.com/photo.png:large?format=auto", "photo.png"],
    ["http://example.com/photo.jpg", "photo.jpg"],
    ["https://example.com/image", "image.jpg"],
    ["https://example.com/bad%ZZ.jpg", "bad%ZZ.jpg"]
  ];
  for (const [url, expected] of cases) {
    assert.equal(context.getOriginalFilename(url), expected);
  }
  const ordinaryUrl = "https://example.com/photo.jpg?signature=unchanged";
  await listeners.clicked({
    menuItemId: "one-click-image-save",
    srcUrl: ordinaryUrl
  }, { id: 1 });
  assert.equal(downloadCalls[0].url, ordinaryUrl);
  assert.equal(Object.hasOwn(downloadCalls[0], "filename"), false);
  assert.equal(context.sanitizeFilename("short-\u00e4-\u{1f431}.png"), "short-\u00e4-\u{1f431}.png");
});
