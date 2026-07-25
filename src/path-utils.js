(function initPathUtils(globalScope) {
  const PATH_UNSAFE_CHARS = /[\\/:*?"<>|]/g;
  const PATH_CONTROL_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

  function sanitizeFolderPath(path) {
    return String(path ?? "")
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => sanitizeFolderPathComponent(part))
      .filter(Boolean)
      .join("/");
  }

  function sanitizeFolderPathComponent(value) {
    const clean = String(value ?? "")
      .replace(PATH_UNSAFE_CHARS, "_")
      .replace(PATH_CONTROL_CHARS, "")
      .replace(/\s+/g, " ")
      .trim()
      // Firefox rejects download-path components that begin or end with a dot.
      .replace(/^\.+|\.+$/g, "");

    return clean;
  }

  const pathUtils = {
    sanitizeFolderPath,
    sanitizeFolderPathComponent
  };

  if (typeof module === "object" && module.exports) {
    module.exports = pathUtils;
    return;
  }

  globalScope.PathUtils = pathUtils;
})(typeof globalThis === "object" ? globalThis : this);
