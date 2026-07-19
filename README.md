# One Click Image Save

A lightweight privacy-friendly Firefox extension that adds a **Save image** entry to the image context menu and downloads an image immediately, without opening the file picker.

Get it from Firefox Add-ons:
https://addons.mozilla.org/firefox/addon/one-click-image-save/

Source code:
https://codeberg.org/wollomatic/one-click-image-save

One Click Image Save supports desktop Firefox 140 and newer.

![Save image context menu](screenshots/screenshot-menu.png)

![Extension options page](screenshots/screenshot-options.png)

## Features

- Right-click an image and select *Save image*
- Downloads start immediately without a save dialog
- Configurable keyboard access key for the context menu entry
- Configurable target folder inside your Firefox downloads directory, or save directly to the downloads directory
- Optional website domain subfolders, with either registered domain or full hostname
- Optional filename prefixes based on website domain and timestamp
- Configurable handling for filename conflicts: create a unique name, overwrite, or skip
- Optional reduced page referrer for compatibility with image servers that require it (disabled by default)
- Optional automatic tab closing after the download starts
- Support for HTTP, HTTPS, and `data:image/...` image URLs
- Transparent saved-settings view with one-click deletion
- No tracking, telemetry, or ads
- Fully open source

## Usage

1. Right-click an image.
2. Select **Save image** (either per mouse or keyboard shortcut).
3. The image is saved to the configured location inside your Firefox downloads directory.

Open the extension options page from the toolbar button or Firefox's add-ons manager to change the target folder, filename behavior, conflict handling, and saved settings. Leave the target folder empty to save directly to Firefox's downloads directory; folder names such as `.images` are supported for hidden directories on Linux. Backslashes are converted to forward slashes because Firefox expects download paths as relative paths such as `Saved Images/example.jpg`.

## Limitations

Due to Firefox extension restrictions, downloads can only be saved within Firefox's configured download directory.
Custom relative subfolders are supported, but arbitrary absolute filesystem paths are not.

The extension does not send a page referrer by default. If an image server rejects a download, the compatibility option can send a reduced referrer: credentials, query parameters, and fragments are removed, and cross-origin targets receive only the source website's origin. Enabling it reveals the source website to the image server.

To keep permissions to a minimum, the extension does not request access to cookies. As a result, saving some images from Firefox container tabs may not work, especially when a login is required. In these cases, use Firefox's built-in **Save Image As** action.

Firefox for Android is not supported.

## Changelog

#### 0.5.0

* Update and pin the development toolchain and resolve known dependency advisories.
* Make referrer transmission opt-in and redact sensitive URL components from diagnostics.
* Explain the new privacy-first referrer default to existing users once after updating, with a link to the compatibility setting.

#### 0.4.0

* Added support for saving directly to Firefox's downloads directory by leaving the target folder empty.
* Allowed dot-prefixed target folders such as `.images` for hidden directories on Linux.
* Clarified that backslashes in target folders are converted to forward slashes for Firefox download paths.
* Added unit tests for target-folder path normalization and sanitation.

#### 0.3.2

* Improved filename and path sanitation.
* Excluded development-only files from packaged builds.

#### 0.3.1

* Improved compatibility with websites requiring a referrer.

#### 0.3.0

* Store only non-default settings.
* Added an option to delete all settings from browser storage.

#### 0.2.3

* First published release.

## Development

Install dependencies:

```bash
pnpm install
```

Run in Firefox:

```bash
pnpm run start
```

Run unit tests:

```bash
pnpm test
```

Or load manually:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json`

### Test the referrer update notice

To display the one-time update notice during development:

1. Open the extension options page.
2. Open the page's developer tools with `F12` and select the console.
3. Run:

   ```js
   await browser.storage.local.set({
     pendingUpdateNotice: true
   });
   location.reload();
   ```

The notice disappears after clicking **Got it**. Run the snippet again to repeat the test.

## Package

```bash
pnpm run build
```

This creates a ZIP file in `web-ext-artifacts/`.

## Permissions

- `contextMenus`: adds the right-click menu entry
- `downloads`: saves the selected image
- `storage`: stores only option values that differ from the defaults

## AI-Assisted Development

This repository was developed using a combination of manual engineering and AI-assisted tooling.

OpenAI Codex was used for tasks such as:
- Code generation
- Refactoring
- Documentation drafting
- Boilerplate creation

All generated output was reviewed and adapted as necessary. No AI-generated contribution is assumed to be correct, secure, or production-ready without human verification.
