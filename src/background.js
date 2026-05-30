const DEFAULTS = {
  targetFolder: "Saved Images",
  filenameMode: "original",
  conflictAction: "uniquify",
  showNotification: true
};

const MENU_ID_SAVE = "one-click-image-save";
const MENU_ID_SAVE_AND_CLOSE = "one-click-image-save-and-close";
const MENU_IDS = [MENU_ID_SAVE, MENU_ID_SAVE_AND_CLOSE];

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

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!MENU_IDS.includes(info.menuItemId) || !info.srcUrl) {
    return;
  }

  try {
    await saveImage(info.srcUrl);

    if (info.menuItemId === MENU_ID_SAVE_AND_CLOSE && typeof tab?.id === "number") {
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
  Promise.all(MENU_IDS.map((menuId) => browser.contextMenus.remove(menuId).catch(() => undefined))).finally(() => {
    browser.contextMenus.create({
      id: MENU_ID_SAVE,
      title: "Save image",
      contexts: ["image"]
    });

    browser.contextMenus.create({
      id: MENU_ID_SAVE_AND_CLOSE,
      title: "Save image and close tab",
      contexts: ["image"]
    });
  });
}

async function saveImage(srcUrl) {
  const options = await getOptions();
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
  return { ...DEFAULTS, ...options };
}

function buildDownloadFilename(srcUrl, options) {
  const folder = sanitizePathSegment(options.targetFolder || DEFAULTS.targetFolder);
  const originalName = getOriginalFilename(srcUrl);
  const safeOriginalName = sanitizeFilename(originalName);

  let finalName;
  if (options.filenameMode === "timestamp") {
    finalName = `${timestamp()}-${safeOriginalName}`;
  } else {
    finalName = safeOriginalName;
  }

  return folder ? `${folder}/${finalName}` : finalName;
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
