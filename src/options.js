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

const form = document.querySelector("#options-form");
const targetFolder = document.querySelector("#target-folder");
const domainSubfolder = document.querySelector("#domain-subfolder");
const completeHostname = document.querySelector("#complete-hostname");
const prefixDomain = document.querySelector("#prefix-domain");
const prefixTimestamp = document.querySelector("#prefix-timestamp");
const overwriteExisting = document.querySelector("#overwrite-existing");
const showNotification = document.querySelector("#show-notification");
const closeTab = document.querySelector("#close-tab");
const status = document.querySelector("#status");
let saveTimeout;
let clearStatusTimeout;

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

for (const control of [
  domainSubfolder,
  completeHostname,
  prefixDomain,
  prefixTimestamp,
  overwriteExisting,
  closeTab,
  showNotification
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
    conflictAction: overwriteExisting.checked ? "overwrite" : "uniquify",
    closeTab: closeTab.checked,
    showNotification: showNotification.checked
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

async function loadOptions() {
  const options = await browser.storage.local.get(DEFAULTS);

  targetFolder.value = options.targetFolder;
  domainSubfolder.checked = options.domainSubfolder;
  completeHostname.checked = options.completeHostname;
  prefixDomain.checked = options.prefixDomain;
  prefixTimestamp.checked = options.prefixTimestamp;
  overwriteExisting.checked = options.conflictAction === "overwrite";
  closeTab.checked = options.closeTab;
  showNotification.checked = options.showNotification;
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
