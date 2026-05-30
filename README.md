# One Click Image Save

A small Firefox WebExtension that adds a right-click menu entry for images and saves them without asking into a configured folder inside the Firefox downloads directory.

## Features

- Right-click an image and choose **Save image**
- Saves without a file picker dialog
- Optional setting to close the current tab after the download starts
- Configurable target subfolder, for example `Saved Images`
- Optional website domain subfolder, with complete-hostname mode
- Optional timestamp or domain name prefix
- Configurable conflict behavior:
  - create unique filename
  - overwrite
- Works without a backend and without Native Messaging

## Important limitation

Firefox extensions using the `downloads` API can suggest a relative filename/path inside the browser's download directory.

Example:

```text
Saved Images/cat.jpg
```

If Firefox's download folder is `~/Downloads`, the image lands in:

```text
~/Downloads/Saved Images/cat.jpg
```

This extension does not write directly to arbitrary absolute paths such as `/home/user/Pictures`.

## Development

Install the helper:

```bash
npm install
```

Run in Firefox:

```bash
npm run start
```

Or load manually:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json`

## Package

```bash
npm run build
```

This creates a ZIP file in `web-ext-artifacts/`.

## Project structure

```text
one-click-image-save/
├─ manifest.json
├─ package.json
├─ src/
│  ├─ background.js
│  ├─ options.html
│  ├─ options.css
│  └─ options.js
└─ icons/
   ├─ icon-48.svg
   └─ icon-96.svg
```

## Permissions

- `contextMenus`: adds the right-click menu entry
- `downloads`: saves the selected image
- `storage`: stores the configured target folder and options
