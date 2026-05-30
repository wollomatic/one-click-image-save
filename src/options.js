const DEFAULTS = {
  targetFolder: "Saved Images",
  filenameMode: "original",
  conflictAction: "uniquify",
  showNotification: true
};

const form = document.querySelector("#options-form");
const targetFolder = document.querySelector("#target-folder");
const filenameMode = document.querySelector("#filename-mode");
const conflictAction = document.querySelector("#conflict-action");
const showNotification = document.querySelector("#show-notification");
const status = document.querySelector("#status");

loadOptions();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const options = {
    targetFolder: normalizeFolder(targetFolder.value),
    filenameMode: filenameMode.value,
    conflictAction: conflictAction.value,
    showNotification: showNotification.checked
  };

  await browser.storage.local.set(options);
  status.textContent = "Options saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});

async function loadOptions() {
  const options = await browser.storage.local.get(DEFAULTS);

  targetFolder.value = options.targetFolder;
  filenameMode.value = options.filenameMode;
  conflictAction.value = options.conflictAction;
  showNotification.checked = options.showNotification;
}

function normalizeFolder(value) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[\\:*?"<>|]/g, "_"))
    .filter(Boolean)
    .join("/") || DEFAULTS.targetFolder;
}
