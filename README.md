# One Click Image Save

> Get it on Firefox add-ons:  
> https://addons.mozilla.org/firefox/addon/one-click-image-save/

A lightweight Firefox extension that adds a **Save image** entry to the image context menu and downloads images instantly without showing the file picker.

Supports desktop Firefox. Firefox for Android is not supported because it does not provide the extension context menu and downloads APIs this add-on depends on.

![Save image context menu](screenshots/screenshot-menu.png)

![Extension options page](screenshots/screenshot-options.png)

## Features

- No tracking, no telemetry, no ads
- Right-click an image and select *Save image*
- Downloads start immediately without a save dialog
- Configurable target folder inside your Firefox downloads directory
- Optional website-specific subfolders
- Optional filename prefixes based on timestamp or website domain
- Configurable handling for filename conflicts
- Optional automatic tab closing after the download starts
- Transparent about saved extension settings
- Fully open source

### Limitation

Due to Firefox extension restrictions, downloads can only be saved within Firefox's configured download directory.
Custom subfolders are supported, but arbitrary absolute filesystem paths are not.

### Changelog

#### 0.3.1

* Improved compatibility with websites requiring a referrer.

#### 0.3.0

* Store only non-default settings.
* Added an option to delete all settings from browser storage.

#### 0.2.3

* First published release.

## Development

Install the helper:

```bash
pnpm install
```

Run in Firefox:

```bash
pnpm run start
```

Or load manually:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json`

## Package

```bash
pnpm run build
```

This creates a ZIP file in `web-ext-artifacts/`.

## Permissions

- `contextMenus`: adds the right-click menu entry
- `downloads`: saves the selected image
- `storage`: stores the configured target folder and options

## AI-Assisted Development

This repository was developed using a combination of manual engineering and AI-assisted tooling.

OpenAI Codex was used for tasks such as:
- Code generation
- Refactoring
- Documentation drafting
- Boilerplate creation

All generated output was reviewed and adapted as necessary. No AI-generated contribution is assumed to be correct, secure, or production-ready without human verification.
