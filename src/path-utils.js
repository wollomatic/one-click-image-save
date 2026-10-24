(function initPathUtils(globalScope) {
  const PATH_UNSAFE_CHARS = /[\\/:*?"<>|]/g;
  const PATH_CONTROL_CHARS = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
  const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:[.\s]|$)/i;

  function isWindowsDeviceName(value) {
    return WINDOWS_DEVICE_NAME.test(value);
  }

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
      // Firefox rejects download-path components that begin or end with a dot.
      .replace(/^[.\s]+|[.\s]+$/g, "");

    return isWindowsDeviceName(clean) ? `_${clean}` : clean;
  }

  const pathUtils = {
    isWindowsDeviceName,
    sanitizeFolderPath,
    sanitizeFolderPathComponent
  };

  if (typeof module === "object" && module.exports) {
    module.exports = pathUtils;
    return;
  }

  globalScope.PathUtils = pathUtils;
})(typeof globalThis === "object" ? globalThis : this);
