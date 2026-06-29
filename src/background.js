const DEFAULTS = {
  targetFolder: "Saved Images",
  domainSubfolder: false,
  completeHostname: false,
  prefixDomain: false,
  prefixTimestamp: false,
  conflictAction: "uniquify",
  closeTab: false,
  menuAccessKey: "i"
};

const MENU_ID_SAVE = "one-click-image-save";
const LEGACY_MENU_IDS = ["one-click-image-save-and-close"];
const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite", "skip"]);
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp", "tif", "tiff"]);
let menuSetup = Promise.resolve();

browser.runtime.onInstalled.addListener(() => initialize());

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
  } catch (error) {
    console.error("Could not save image:", error);
  }
});

async function initialize() {
  await createContextMenu();
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
    throw new Error(`Unsupported image URL scheme: ${safeUrlForLog(srcUrl)}`);
  }

  const filename = buildDownloadFilename(srcUrl, options);

  if (options.conflictAction === "skip" && await downloadExists(filename)) {
    return false;
  }

  await browser.downloads.download(buildDownloadOptions(srcUrl, filename, info, tab, options));

  return true;
}

function buildDownloadOptions(srcUrl, filename, info, tab, options) {
  const downloadOptions = {
    url: srcUrl,
    filename,
    saveAs: false,
    conflictAction: downloadConflictAction(options.conflictAction)
  };

  const referer = downloadReferer(srcUrl, info);

  if (referer) {
    downloadOptions.headers = [{ name: "Referer", value: referer }];
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

function downloadReferer(srcUrl, info) {
  const imageUrl = parseHttpUrl(srcUrl);
  const documentUrl = parseHttpUrl(info.frameUrl) || parseHttpUrl(info.pageUrl);

  if (!imageUrl || !documentUrl) {
    return null;
  }

  if (documentUrl.protocol === "https:" && imageUrl.protocol === "http:") {
    return null;
  }

  if (documentUrl.origin === imageUrl.origin) {
    return sameOriginReferer(documentUrl);
  }

  return `${documentUrl.origin}/`;
}

function sameOriginReferer(url) {
  const referer = new URL(url.href);
  referer.username = "";
  referer.password = "";
  referer.hash = "";

  return referer.href;
}

function isHttpUrl(value) {
  return Boolean(parseHttpUrl(value));
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {
    // Ignore invalid URLs.
  }

  return null;
}

function safeUrlForLog(srcUrl) {
  return String(srcUrl).slice(0, 120).replace(/[\u0000-\u001f\u007f]/g, "");
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

function buildDownloadFilename(srcUrl, options) {
  const folder = PathUtils.sanitizeFolderPath(options.targetFolder);
  const folderParts = [folder];
  const originalName = getOriginalFilename(srcUrl);
  const safeOriginalName = sanitizeFilename(originalName);
  const prefixes = [];

  if (options.domainSubfolder) {
    folderParts.push(domainSubfolderName(srcUrl, options));
  }

  if (options.prefixDomain) {
    prefixes.push(domainName(srcUrl));
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

    if (hasUsefulExtension(candidate)) {
      return candidate;
    }

    const guessed = extensionFromMimeLikeUrl(url) || "jpg";
    return `${candidate}.${guessed}`;
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
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp|tiff?)$/i.test(filename);
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
  const subtype = match?.[1]?.replace(/\+xml$/i, "");

  return normalizeImageExtension(subtype);
}

function normalizeImageExtension(extension) {
  if (!extension || !/^[a-z0-9]{2,5}$/i.test(extension)) {
    return null;
  }

  const normalized = extension.toLowerCase();

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

  const extension = filename.match(/\.(avif|bmp|gif|jpe?g|png|svg|webp|tiff?)$/i)?.[0] || "";

  if (!extension || extension.length >= maxLength) {
    return cleanPathComponent(filename.slice(0, maxLength)) || "image";
  }

  const basename = cleanPathComponent(filename.slice(0, maxLength - extension.length)) || "image";

  return `${basename}${extension}`;
}

function domainName(srcUrl) {
  return sanitizeDomainPrefix(websiteDomain(srcUrl));
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
