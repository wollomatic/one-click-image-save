const DEFAULTS = {
  targetFolder: "Saved Images",
  domainSubfolder: false,
  completeHostname: false,
  prefixDomain: false,
  prefixTimestamp: false,
  conflictAction: "uniquify",
  closeTab: false,
  showNotification: true
};

const MENU_ID_SAVE = "one-click-image-save";
const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite"]);

browser.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  createContextMenu();
});

browser.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  createContextMenu();
});

// During temporary add-on reloads, this makes the menu appear immediately.
createContextMenu();

browser.action.onClicked.addListener(() => {
  browser.runtime.openOptionsPage();
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID_SAVE || !info.srcUrl) {
    return;
  }

  try {
    const options = await getOptions();
    await saveImage(info.srcUrl, options);

    if (options.closeTab && typeof tab?.id === "number") {
      await closeTab(tab.id);
    }
  } catch (error) {
    console.error("Could not save image:", error);

    browser.notifications.create("save-failed", {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-96.svg"),
      title: "Could not save image",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

function createContextMenu() {
  Promise.all([
    browser.contextMenus.remove(MENU_ID_SAVE).catch(() => undefined),
    browser.contextMenus.remove("one-click-image-save-and-close").catch(() => undefined)
  ]).finally(() => {
    browser.contextMenus.create({
      id: MENU_ID_SAVE,
      title: "Save image",
      contexts: ["image"]
    });
  });
}

async function saveImage(srcUrl, options) {
  const filename = buildDownloadFilename(srcUrl, options);

  const downloadId = await browser.downloads.download({
    url: srcUrl,
    filename,
    saveAs: false,
    conflictAction: options.conflictAction
  });

  if (options.showNotification) {
    browser.notifications.create(`saved-${downloadId}`, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-96.svg"),
      title: "Image save started",
      message: filename
    });
  }
}

async function closeTab(tabId) {
  try {
    await browser.tabs.remove(tabId);
  } catch (error) {
    console.warn("Could not close tab after saving image:", error);
  }
}

async function ensureDefaults() {
  const current = await browser.storage.local.get(DEFAULTS);
  await browser.storage.local.set({ ...DEFAULTS, ...current });
}

async function getOptions() {
  const options = await browser.storage.local.get(DEFAULTS);
  const normalized = { ...DEFAULTS, ...options };

  if (!CONFLICT_ACTIONS.has(normalized.conflictAction)) {
    normalized.conflictAction = DEFAULTS.conflictAction;
  }

  return normalized;
}

function buildDownloadFilename(srcUrl, options) {
  const folder = sanitizePathSegment(options.targetFolder || DEFAULTS.targetFolder);
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
    const lastSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
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

function hasUsefulExtension(filename) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp|tiff?)$/i.test(filename);
}

function extensionFromMimeLikeUrl(url) {
  const format = url.searchParams.get("format") || url.searchParams.get("fm");
  if (format && /^[a-z0-9]{2,5}$/i.test(format)) {
    return format.toLowerCase().replace("jpeg", "jpg");
  }
  return null;
}

function sanitizeFilename(filename) {
  const clean = filename
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "image")
    .slice(0, 180);

  return clean || `image-${timestamp()}.jpg`;
}

function sanitizePathSegment(path) {
  return path
    .split("/")
    .map((part) => sanitizeFilename(part))
    .filter(Boolean)
    .join("/");
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

    if (parts.length <= 2) {
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
