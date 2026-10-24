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
const ACTION_TITLE = "Open One Click Image Save options";
// Match-pattern paths are case-sensitive, but image MIME types are not.
const IMAGE_URL_PATTERNS = [
  "http://*/*",
  "https://*/*",
  ...Array.from("image").reduce(
    (prefixes, letter) => prefixes.flatMap((prefix) => [prefix + letter, prefix + letter.toUpperCase()]),
    ["data:"]
  ).map((prefix) => `${prefix}/*`)
];
const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite", "skip"]);
const IMAGE_SIZE_SUFFIX = /(\.(avif|bmp|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svg|webp|tiff?)):[a-z0-9_-]+$/i;
const UTF8_ENCODER = new TextEncoder();
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
let feedbackUpdates = Promise.resolve();
// Register download listeners during script evaluation so Firefox can wake this
// event page after suspension. Only temporary download state goes into session.
const downloadManager = DownloadUtils.createDownloadManager(
  browser.downloads,
  browser.storage.session,
  {
    onComplete: async ({ tabId }) => {
      if (typeof tabId === "number") {
        await closeTab(tabId);
      }
    },
    onError: async (error, record) => {
      if (record) {
        await showDownloadError(record.sourceTabId ?? record.tabId, error);
      } else {
        // A bookkeeping error does not mean the download itself failed.
        console.error("Could not update image download state.");
      }
    }
  }
);

browser.runtime.onInstalled.addListener(() => {
  initialize().catch((error) => {
    console.error("Could not finish extension update setup:", error);
  });
});

browser.runtime.onStartup.addListener(() => initialize());

// During temporary add-on reloads, this makes the menu appear immediately.
initialize().catch((error) => {
  console.error("Could not initialize One Click Image Save:", error);
});

browser.action.onClicked.addListener(async (tab) => {
  await setDownloadFeedback(tab?.id);
  await browser.runtime.openOptionsPage();
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
    await setDownloadFeedback(tab?.id);
    const options = await getOptions();
    const started = await saveImage(info, tab, options);
    if (!started) {
      await setDownloadFeedback(tab?.id, "–", "Skipped: a matching downloaded file already exists.");
    }
  } catch (error) {
    await showDownloadError(tab?.id, error);
  }
});

async function initialize() {
  await createContextMenu();
}

function createContextMenu() {
  menuSetup = menuSetup.catch(() => undefined).then(async () => {
    const options = await getOptions();

    await browser.contextMenus.remove(MENU_ID_SAVE).catch(() => undefined);

    browser.contextMenus.create({
      id: MENU_ID_SAVE,
      title: menuTitle(options.menuAccessKey),
      contexts: ["image"],
      targetUrlPatterns: IMAGE_URL_PATTERNS
    });
  });

  return menuSetup;
}

async function saveImage(info, tab, options) {
  const srcUrl = info.srcUrl;

  if (!isAllowedImageUrl(srcUrl)) {
    throw new Error("Unsupported image URL scheme.");
  }

  const filename = DownloadUtils.shouldUseBrowserFilename(srcUrl, options) &&
    !hasImageSizeSuffix(srcUrl) && !PathUtils.isWindowsDeviceName(imagePathFilename(new URL(srcUrl)))
    ? undefined
    : buildDownloadFilename(srcUrl, info, options);

  if (options.conflictAction === "skip" && await downloadExists(filename)) {
    return false;
  }

  const downloadSource = await DownloadUtils.prepareDownloadUrl(srcUrl);

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
    await downloadManager.start(
      primaryOptions,
      fallbackOptions,
      {
        tabId: options.closeTab && typeof tab?.id === "number" ? tab.id : null,
        sourceTabId: typeof tab?.id === "number" ? tab.id : null,
        objectUrl: downloadSource.url.startsWith("blob:") ? downloadSource.url : null
      }
    );
  } catch (error) {
    downloadSource.revoke();
    throw error;
  }

  return true;
}

function setDownloadFeedback(tabId, text = "", message = "", color = "#4b5563") {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return Promise.resolve();
  }

  feedbackUpdates = feedbackUpdates.then(async () => {
    if (text) {
      await browser.action.setBadgeBackgroundColor({ tabId, color });
      await browser.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    }
    await browser.action.setTitle({ tabId, title: message ? `${message}\n${ACTION_TITLE}` : ACTION_TITLE });
    await browser.action.setBadgeText({ tabId, text });
  }).catch(() => {
    // A closed tab or unavailable toolbar must not affect download handling.
  });
  return feedbackUpdates;
}

function showDownloadError(tabId, error) {
  const reason = error === "DOWNLOAD_REMOVED" ? error : DownloadUtils.interruptReason(error);
  if (reason === "USER_CANCELED" || reason === "DOWNLOAD_REMOVED") {
    return setDownloadFeedback(tabId, "–", reason === "USER_CANCELED"
      ? "Image download cancelled."
      : "Image download removed from history before completion.");
  }

  console.error("Could not save image.");
  const messages = {
    SERVER_FORBIDDEN: "The image server refused the download.",
    SERVER_UNAUTHORIZED: "The image server requires authentication.",
    SERVER_BAD_CONTENT: "The image server returned an error or invalid content.",
    NETWORK_TIMEOUT: "The image download timed out.",
    FILE_NO_SPACE: "Not enough disk space to save the image.",
    FILE_ACCESS_DENIED: "Firefox could not write to the download folder.",
    FILE_NAME_TOO_LONG: "The download filename is too long.",
    FILE_BLOCKED: "Firefox blocked the image download.",
    FILE_VIRUS_INFECTED: "Firefox blocked the image download.",
    FILE_SECURITY_CHECK_FAILED: "Firefox blocked the image download."
  };
  const message = messages[reason] || (reason.startsWith("NETWORK_")
    ? "The image download failed because of a network error."
    : "The image could not be saved.");
  return setDownloadFeedback(tabId, "!", message, "#b42338");
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

  const finalName = sanitizeFilename([...prefixes, safeOriginalName].join("-"));

  return [...folderParts, finalName].filter(Boolean).join("/");
}

function getOriginalFilename(srcUrl) {
  try {
    const url = new URL(srcUrl);
    if (url.protocol === "data:" && /^data:image\//i.test(srcUrl)) {
      const dataImageExtension = extensionFromDataImageUrl(srcUrl);
      return `image-${timestamp()}${dataImageExtension ? `.${dataImageExtension}` : ""}`;
    }

    const lastSegment = imagePathFilename(url).replace(IMAGE_SIZE_SUFFIX, "$1");
    const candidate = lastSegment || "image";
    const formatExtension = extensionFromMimeLikeUrl(url);

    if (formatExtension) {
      return replaceFilenameExtension(candidate, formatExtension);
    }

    if (hasUsefulExtension(candidate)) {
      return candidate;
    }

    // A URL alone cannot identify the response MIME type. Keep unknown formats
    // extensionless instead of labelling PNG/WebP/etc. bytes as JPEG.
    return candidate.replace(/\./g, "_");
  } catch {
    return `image-${timestamp()}`;
  }
}

function imagePathFilename(url) {
  return decodePathSegment(url.pathname.split("/").filter(Boolean).pop() || "");
}

function hasImageSizeSuffix(srcUrl) {
  return IMAGE_SIZE_SUFFIX.test(imagePathFilename(new URL(srcUrl)));
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
    ["x-png", "png"],
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
    return `image-${timestamp()}`;
  }

  return truncateFilename(clean, 180);
}

function cleanPathComponent(value) {
  return PathUtils.sanitizeFolderPathComponent(value);
}

function truncateFilename(filename, maxBytes) {
  if (UTF8_ENCODER.encode(filename).length <= maxBytes) {
    return filename;
  }

  const extension = filename.match(/\.(avif|bmp|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svg|webp|tiff?)$/i)?.[0] || "";

  if (!extension || extension.length >= maxBytes) {
    return cleanPathComponent(truncateUtf8(filename, maxBytes)) || "image";
  }

  const basename = cleanPathComponent(truncateUtf8(filename, maxBytes - extension.length)) || "image";

  return `${basename}${extension}`;
}

function truncateUtf8(value, maxBytes) {
  let result = "";
  let bytes = 0;

  // Iterate over code points so truncation never splits a surrogate pair.
  for (const character of value) {
    const characterBytes = UTF8_ENCODER.encode(character).length;
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }

  return result;
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
