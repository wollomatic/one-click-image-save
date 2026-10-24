const assert = require("node:assert/strict");
const test = require("node:test");

const {
  sanitizeFolderPath,
  sanitizeFolderPathComponent
} = require("../src/path-utils");

test("sanitizeFolderPath keeps an empty target folder empty", () => {
  assert.equal(sanitizeFolderPath(""), "");
  assert.equal(sanitizeFolderPath(null), "");
  assert.equal(sanitizeFolderPath(undefined), "");
});

test("sanitizeFolderPath normalizes separators for Firefox download paths", () => {
  assert.equal(sanitizeFolderPath("Saved Images\\cats\\photo.jpg"), "Saved Images/cats/photo.jpg");
  assert.equal(sanitizeFolderPath("Saved Images//cats"), "Saved Images/cats");
});

test("sanitizeFolderPath removes traversal path segments", () => {
  assert.equal(sanitizeFolderPath("../Saved Images/./../cats"), "Saved Images/cats");
  assert.equal(sanitizeFolderPath("./.."), "");
});

test("sanitizeFolderPath keeps absolute-looking paths relative", () => {
  assert.equal(sanitizeFolderPath("/tmp/images"), "tmp/images");
  assert.equal(sanitizeFolderPath("C:\\Users\\Name\\Pictures"), "C_/Users/Name/Pictures");
  assert.equal(sanitizeFolderPath("C:/Users/Name/Pictures"), "C_/Users/Name/Pictures");
});

test("sanitizeFolderPath normalizes folder names Firefox would reject", () => {
  assert.equal(sanitizeFolderPath(".images/.../foo..bar/cache."), "images/foo..bar/cache");
});

test("sanitizeFolderPath cleans unsafe characters and whitespace", () => {
  assert.equal(sanitizeFolderPath("  Saved   Images  /bad:name*  "), "Saved Images/bad_name_");
  assert.equal(sanitizeFolderPath("control\u202echar"), "controlchar");
});

test("sanitizeFolderPathComponent removes leading and trailing dots", () => {
  assert.equal(sanitizeFolderPathComponent("."), "");
  assert.equal(sanitizeFolderPathComponent(".."), "");
  assert.equal(sanitizeFolderPathComponent("..."), "");
  assert.equal(sanitizeFolderPathComponent(".hidden"), "hidden");
  assert.equal(sanitizeFolderPathComponent("visible."), "visible");
  assert.equal(sanitizeFolderPathComponent("foo..bar"), "foo..bar");
});

test("Windows device names are prefixed without changing extensions or ordinary names", () => {
  for (const name of ["AUX", "con.png", "PRN.jpg", "nul.webp", "COM1", "lpt9.gif", "COM\u00b9.png", "CONIN$", "conout$.png", "CON .png"]) {
    assert.equal(sanitizeFolderPathComponent(name), "_" + name);
  }
  for (const name of ["auxiliary.png", "console", "COM10.png", "LPT0", "example.com"]) {
    assert.equal(sanitizeFolderPathComponent(name), name);
  }
  assert.equal(sanitizeFolderPath("AUX/CON.png"), "_AUX/_CON.png");
  assert.equal(sanitizeFolderPathComponent(" . . "), "");
});
