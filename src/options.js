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

const form = document.querySelector("#options-form");
const targetFolder = document.querySelector("#target-folder");
const domainSubfolder = document.querySelector("#domain-subfolder");
const completeHostname = document.querySelector("#complete-hostname");
const prefixDomain = document.querySelector("#prefix-domain");
const prefixTimestamp = document.querySelector("#prefix-timestamp");
const menuAccessKey = document.querySelector("#menu-access-key");
const conflictActions = [...document.querySelectorAll('input[name="conflictAction"]')];
const closeTab = document.querySelector("#close-tab");
const status = document.querySelector("#status");
const extensionVersion = document.querySelector("#extension-version");
let saveTimeout;
let clearStatusTimeout;

setVersionInfo();
loadOptions();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOptions();
});

targetFolder.addEventListener("input", scheduleSave);
targetFolder.addEventListener("blur", () => {
  targetFolder.value = normalizeFolder(targetFolder.value);
  saveOptions();
});

menuAccessKey.addEventListener("input", () => {
  menuAccessKey.value = normalizeAccessKey(menuAccessKey.value);
  saveOptions();
});

for (const control of [
  domainSubfolder,
  completeHostname,
  prefixDomain,
  prefixTimestamp,
  ...conflictActions,
  closeTab
]) {
  control.addEventListener("change", saveOptions);
}

domainSubfolder.addEventListener("change", updateDependentControls);

function getOptions() {
  return {
    targetFolder: normalizeFolder(targetFolder.value),
    domainSubfolder: domainSubfolder.checked,
    completeHostname: completeHostname.checked,
    prefixDomain: prefixDomain.checked,
    prefixTimestamp: prefixTimestamp.checked,
    conflictAction: selectedConflictAction(),
    closeTab: closeTab.checked,
    menuAccessKey: normalizeAccessKey(menuAccessKey.value)
  };
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveOptions, 350);
}

async function saveOptions() {
  clearTimeout(saveTimeout);

  try {
    await browser.storage.local.set(getOptions());
    showStatus("Options autosaved.");
  } catch (error) {
    console.error("Could not save options:", error);
    showStatus("Could not autosave options.");
  }
}

function showStatus(message) {
  clearTimeout(clearStatusTimeout);
  status.textContent = message;
  clearStatusTimeout = setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

function setVersionInfo() {
  extensionVersion.textContent = `version ${browser.runtime.getManifest().version}`;
}

async function loadOptions() {
  const options = await browser.storage.local.get(DEFAULTS);

  targetFolder.value = options.targetFolder;
  domainSubfolder.checked = options.domainSubfolder;
  completeHostname.checked = options.completeHostname;
  prefixDomain.checked = options.prefixDomain;
  prefixTimestamp.checked = options.prefixTimestamp;
  menuAccessKey.value = normalizeAccessKey(options.menuAccessKey);
  setConflictAction(options.conflictAction);
  closeTab.checked = options.closeTab;
  updateDependentControls();
}

function updateDependentControls() {
  completeHostname.disabled = !domainSubfolder.checked;
}

function normalizeFolder(value) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[\\:*?"<>|]/g, "_"))
    .filter(Boolean)
    .join("/") || DEFAULTS.targetFolder;
}

function normalizeAccessKey(value) {
  const normalized = String(value || "").trim();

  if (/^[a-z0-9]$/i.test(normalized)) {
    return normalized;
  }

  return "";
}

function selectedConflictAction() {
  return conflictActions.find((control) => control.checked)?.value || DEFAULTS.conflictAction;
}

function setConflictAction(value) {
  const normalized = ["uniquify", "overwrite", "skip"].includes(value) ? value : DEFAULTS.conflictAction;
  const selected = conflictActions.find((control) => control.value === normalized);

  if (selected) {
    selected.checked = true;
  }
}
