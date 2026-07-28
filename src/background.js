const DEFAULTS = {
  targetFolder: "Saved Images",
  domainSubfolder: false,
  completeHostname: false,
  prefixDomain: false,
  prefixTimestamp: false,
  conflictAction: "uniquify",
  sendReferer: false,
  refererMode: "retry",
  closeTab: false,
  menuAccessKey: "i"
};

const MENU_ID_SAVE = "one-click-image-save";
const LEGACY_MENU_IDS = ["one-click-image-save-and-close"];
const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite", "skip"]);
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jfif",
  "jpg",
  "jpeg",
  "jxl",
  "png",
  "svg",
  "webp",
  "tif",
  "tiff"
]);
let menuSetup = Promise.resolve();

browser.runtime.onInstalled.addListener((details) => {
  handleInstalled(details).catch((error) => {
    console.error("Could not finish extension update setup:", error);
  });
});

browser.runtime.onStartup.addListener(() => initialize());

// During temporary add-on reloads, this makes the menu appear immediately.
initialize().catch((error) => {
  console.error("Could not initialize One Click Image Save:", error);
});

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.menuAccessKey) {
    createContextMenu();
  }
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID_SAVE || !info.srcUrl) {
    return;
  }

  try {
    const options = await getOptions();
    const saved = await saveImage(info, tab, options);

    if (saved && options.closeTab && typeof tab?.id === "number") {
      await closeTab(tab.id);
    }
  } catch {
    console.error("Could not save image.");
  }
});

async function initialize() {
  await createContextMenu();
}

async function handleInstalled(details) {
  await migrateToVersion110(details);
  await initialize();
}

async function migrateToVersion110(details) {
  if (
    details.reason !== "update" ||
    details.temporary === true ||
    details.previousVersion === "1.1.0" ||
    browser.runtime.getManifest().version !== "1.1.0"
  ) {
    return;
  }

  const saved = await browser.storage.local.get([
    "sendReferer",
    "refererMode",
    "completeHostname"
  ]);
  const migrated = {};

  if (saved.sendReferer === true && saved.refererMode === undefined) {
    migrated.refererMode = "always";
  }

  if (saved.completeHostname === undefined) {
    migrated.completeHostname = false;
  }

  if (Object.keys(migrated).length > 0) {
    await browser.storage.local.set(migrated);
  }
}

function createContextMenu() {
  menuSetup = menuSetup.catch(() => undefined).then(async () => {
    const options = await getOptions();

    await Promise.all([MENU_ID_SAVE, ...LEGACY_MENU_IDS].map((menuId) => (
      browser.contextMenus.remove(menuId).catch(() => undefined)
    )));

    browser.contextMenus.create({
      id: MENU_ID_SAVE,
      title: menuTitle(options.menuAccessKey),
      contexts: ["image"]
    });
  });

  return menuSetup;
}

async function saveImage(info, tab, options) {
  const srcUrl = info.srcUrl;

  if (!isAllowedImageUrl(srcUrl)) {
    throw new Error("Unsupported image URL scheme.");
  }

  const filename = DownloadUtils.shouldUseBrowserFilename(srcUrl, options)
    ? undefined
    : buildDownloadFilename(srcUrl, info, options);

  if (options.conflictAction === "skip" && await downloadExists(filename)) {
    return false;
  }

  const downloadSource = await DownloadUtils.prepareDownloadUrl(srcUrl);
  let result;

  try {
    const primaryOptions = buildDownloadOptions(
      downloadSource.url,
      filename,
      info,
      tab,
      options,
      options.sendReferer && options.refererMode === "always"
    );
    const fallbackCandidate = options.sendReferer && options.refererMode === "retry"
      ? buildDownloadOptions(downloadSource.url, filename, info, tab, options, true)
      : null;
    const fallbackOptions = fallbackCandidate?.headers ? fallbackCandidate : null;
    result = await DownloadUtils.downloadWithRefererFallback(
      browser.downloads,
      primaryOptions,
      fallbackOptions
    );
  } finally {
    downloadSource.revoke();
  }

  if (!result.success) {
    throw new Error("Download failed.");
  }

  return true;
}

function buildDownloadOptions(srcUrl, filename, info, tab, options, sendReferer) {
  const downloadOptions = {
    url: srcUrl,
    saveAs: false,
    conflictAction: downloadConflictAction(options.conflictAction)
  };

  if (filename) {
    downloadOptions.filename = filename;
  }

  const headers = PrivacyUtils.buildRefererHeaders(srcUrl, info, sendReferer);

  if (headers) {
    downloadOptions.headers = headers;
  }

  if (tab?.incognito) {
    downloadOptions.incognito = true;
  }

  return downloadOptions;
}

function isAllowedImageUrl(srcUrl) {
  try {
    const url = new URL(srcUrl);

    if (isHttpUrl(srcUrl)) {
      return true;
    }

    return url.protocol === "data:" && /^data:image\//i.test(srcUrl);
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function downloadExists(filename) {
  const matchingDownloads = await browser.downloads.search({
    filenameRegex: downloadFilenameSuffixRegex(filename),
    exists: true,
    state: "complete"
  });

  return matchingDownloads.length > 0;
}

function downloadFilenameSuffixRegex(filename) {
  const parts = filename.split("/").filter(Boolean).map(escapeRegex);

  return `[\\\\/]${parts.join("[\\\\/]")}$`;
}

function escapeRegex(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function downloadConflictAction(conflictAction) {
  return conflictAction === "overwrite" ? "overwrite" : "uniquify";
}

async function closeTab(tabId) {
  try {
    await browser.tabs.remove(tabId);
  } catch (error) {
    console.warn("Could not close tab after saving image:", error);
  }
}

async function getOptions() {
  const options = await browser.storage.local.get(DEFAULTS);
  const normalized = { ...DEFAULTS, ...options };

  if (!CONFLICT_ACTIONS.has(normalized.conflictAction)) {
    normalized.conflictAction = DEFAULTS.conflictAction;
  }

  normalized.menuAccessKey = normalizeAccessKey(normalized.menuAccessKey);
  normalized.sendReferer = normalized.sendReferer === true;
  normalized.refererMode = DownloadUtils.normalizeRefererMode(normalized.refererMode);

  return normalized;
}

function menuTitle(accessKey) {
  const title = "Save image";
  const normalizedAccessKey = normalizeAccessKey(accessKey);

  if (!normalizedAccessKey) {
    return title;
  }

  const accessKeyIndex = title.toLowerCase().indexOf(normalizedAccessKey.toLowerCase());

  if (accessKeyIndex >= 0) {
    return `${title.slice(0, accessKeyIndex)}&${title.slice(accessKeyIndex)}`;
  }

  return `${title} (&${normalizedAccessKey.toUpperCase()})`;
}

function normalizeAccessKey(value) {
  const normalized = String(value || "").trim();

  if (/^[a-z0-9]$/i.test(normalized)) {
    return normalized;
  }

  return "";
}

function buildDownloadFilename(srcUrl, info, options) {
  const folder = PathUtils.sanitizeFolderPath(options.targetFolder);
  const folderParts = [folder];
  const originalName = getOriginalFilename(srcUrl);
  const safeOriginalName = sanitizeFilename(originalName);
  const prefixes = [];
  const domainUrl = info.pageUrl || info.frameUrl || srcUrl;

  if (options.domainSubfolder) {
    folderParts.push(domainSubfolderName(domainUrl, options));
  }

  if (options.prefixDomain) {
    prefixes.push(domainName(domainUrl, options));
  }

  if (options.prefixTimestamp) {
    prefixes.push(timestamp());
  }

  const finalName = [...prefixes, safeOriginalName].join("-");

  return [...folderParts, finalName].filter(Boolean).join("/");
}

function getOriginalFilename(srcUrl) {
  try {
    const url = new URL(srcUrl);
    const dataImageExtension = extensionFromDataImageUrl(srcUrl);

    if (dataImageExtension) {
      return `image-${timestamp()}.${dataImageExtension}`;
    }

    const lastSegment = decodePathSegment(url.pathname.split("/").filter(Boolean).pop() || "");
    const candidate = lastSegment || "image";
    const formatExtension = extensionFromMimeLikeUrl(url);

    if (formatExtension) {
      return replaceFilenameExtension(candidate, formatExtension);
    }

    if (hasUsefulExtension(candidate)) {
      return candidate;
    }

    return `${candidate}.jpg`;
  } catch {
    return `image-${timestamp()}.jpg`;
  }
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function hasUsefulExtension(filename) {
  return /\.(avif|bmp|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svg|webp|tiff?)$/i.test(filename);
}

function replaceFilenameExtension(filename, extension) {
  const basename = filename.replace(/\.[a-z0-9]{1,8}$/i, "") || "image";
  return `${basename}.${extension}`;
}

function extensionFromMimeLikeUrl(url) {
  const format = url.searchParams.get("format") || url.searchParams.get("fm");
  const extension = normalizeImageExtension(format);

  if (extension) {
    return extension;
  }

  return null;
}

function extensionFromDataImageUrl(srcUrl) {
  const match = String(srcUrl).match(/^data:image\/([a-z0-9.+-]+)[;,]/i);
  const subtype = match?.[1];

  return normalizeImageExtension(subtype);
}

function normalizeImageExtension(extension) {
  const aliases = new Map([
    ["jpeg", "jpg"],
    ["svg+xml", "svg"],
    ["x-icon", "ico"],
    ["vnd.microsoft.icon", "ico"]
  ]);
  const candidate = String(extension || "").toLowerCase();
  const normalized = aliases.get(candidate) || candidate;

  if (!/^[a-z0-9]{2,5}$/i.test(normalized)) {
    return null;
  }

  if (!IMAGE_EXTENSIONS.has(normalized)) {
    return null;
  }

  return normalized;
}

function sanitizeFilename(filename) {
  const clean = cleanPathComponent(filename);

  if (!clean) {
    return `image-${timestamp()}.jpg`;
  }

  return truncateFilename(clean, 180);
}

function cleanPathComponent(value) {
  return String(value ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");
}

function truncateFilename(filename, maxLength) {
  if (filename.length <= maxLength) {
    return filename;
  }

  const extension = filename.match(/\.(avif|bmp|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svg|webp|tiff?)$/i)?.[0] || "";

  if (!extension || extension.length >= maxLength) {
    return cleanPathComponent(filename.slice(0, maxLength)) || "image";
  }

  const basename = cleanPathComponent(filename.slice(0, maxLength - extension.length)) || "image";

  return `${basename}${extension}`;
}

function domainName(srcUrl, options) {
  const domain = options.completeHostname ? completeHostname(srcUrl) : websiteDomain(srcUrl);
  return sanitizeDomainPrefix(domain);
}

function domainSubfolderName(srcUrl, options) {
  const domain = options.completeHostname ? completeHostname(srcUrl) : websiteDomain(srcUrl);
  return sanitizeFilename(domain);
}

function completeHostname(srcUrl) {
  try {
    return new URL(srcUrl).hostname || "unknown-domain";
  } catch {
    return "unknown-domain";
  }
}

function websiteDomain(srcUrl) {
  try {
    const hostname = new URL(srcUrl).hostname.replace(/^www\./i, "");
    const parts = hostname.split(".").filter(Boolean);

    if (parts.length <= 2 || isIpAddress(hostname)) {
      return hostname || "unknown-domain";
    }

    const suffix = parts.slice(-2).join(".");
    const secondLevelSuffixes = new Set(["co.uk", "com.au", "com.br", "com.cn", "com.mx", "com.tr", "co.jp"]);
    const domainParts = secondLevelSuffixes.has(suffix) ? parts.slice(-3) : parts.slice(-2);

    return domainParts.join(".") || "unknown-domain";
  } catch {
    return "unknown-domain";
  }
}

function isIpAddress(hostname) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function sanitizeDomainPrefix(domain) {
  return sanitizeFilename(domain.replace(/\./g, "_"));
}

function timestamp() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + "_" + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("-");
}
