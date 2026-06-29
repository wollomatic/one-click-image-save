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
const manageSettings = document.querySelector("#manage-settings");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsSummary = document.querySelector("#settings-summary");
const settingsContent = document.querySelector("#settings-content");
const deleteSettings = document.querySelector("#delete-settings");
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
manageSettings.addEventListener("click", openSettingsDialog);
deleteSettings.addEventListener("click", deleteSavedSettings);

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
    await saveChangedOptions(getOptions());
    showStatus("Options autosaved.");
  } catch (error) {
    console.error("Could not save options:", error);
    showStatus("Could not autosave options.");
  }
}

async function saveChangedOptions(options) {
  const changedOptions = Object.fromEntries(
    Object.entries(options).filter(([key, value]) => value !== DEFAULTS[key])
  );

  await browser.storage.local.remove(Object.keys(DEFAULTS));

  if (Object.keys(changedOptions).length > 0) {
    await browser.storage.local.set(changedOptions);
  }
}

async function openSettingsDialog(event) {
  event.preventDefault();

  await refreshStoredSettings();
  settingsDialog.showModal();
}

async function refreshStoredSettings() {
  try {
    const savedSettings = await browser.storage.local.get(null);
    const savedEntries = Object.entries(savedSettings);

    if (savedEntries.length === 0) {
      settingsSummary.textContent = "No saved settings are currently stored in this browser.";
      settingsContent.textContent = "";
      settingsContent.hidden = true;
      deleteSettings.disabled = true;
      return;
    }

    settingsSummary.textContent = `${savedEntries.length} saved setting${savedEntries.length === 1 ? "" : "s"} currently stored in this browser:`;
    settingsContent.textContent = JSON.stringify(savedSettings, null, 2);
    settingsContent.hidden = false;
    deleteSettings.disabled = false;
  } catch (error) {
    console.error("Could not read saved settings:", error);
    settingsSummary.textContent = "Could not read saved browser settings.";
    settingsContent.textContent = "";
    settingsContent.hidden = true;
    deleteSettings.disabled = true;
  }
}

async function deleteSavedSettings() {
  if (!confirm("Remove all saved One Click Image Save settings from this browser?")) {
    return;
  }

  clearTimeout(saveTimeout);

  try {
    await browser.storage.local.clear();
    await loadOptions();
    await refreshStoredSettings();
    showStatus("Saved settings removed.");
  } catch (error) {
    console.error("Could not remove saved settings:", error);
    showStatus("Could not remove saved settings.");
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
  const folder = String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map(normalizeFolderPart)
    .filter(Boolean)
    .join("/");

  return folder || DEFAULTS.targetFolder;
}

function normalizeFolderPart(part) {
  return part
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .replace(/[\\:*?"<>|]/g, "_");
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
