# One Click Image Save — image test bench

A static page with 24 manual image download tests. All assets are local; no installation or build is required.

Run from the repository root:

```sh
pnpm run start:test-website
```

Open **http://127.0.0.1:8080** in Firefox 140+ with the add-on installed. To use another port, run `pnpm run start:test-website 8081`. Stop with Ctrl+C. Any static HTTP server can serve this folder.

Use HTTP: the add-on rejects `file:` image URLs.

Each case describes the embedding and expected result. Right-click the image, choose the add-on’s **Save image** entry, then mark passed or failed. A pass means the result matches the expectation, including expected refusals. Reloading clears results.

Filename examples assume default settings: `Saved Images` folder, no domain subfolder or filename prefixes, unique filenames on conflict, referrer transmission off, and automatic tab closing off. Existing files may cause collision suffixes.

CSS background and canvas behavior depends on Firefox’s image context. Authentication, referrer rejection, redirects, response headers, and interrupted downloads need a separate server. The GIF has one frame. Windows filename restrictions prevent colon and device-name fixtures.

To regenerate PNG, JPEG, and GIF fixtures on Windows, run `assets/create-fixtures.ps1` (.NET System.Drawing). WebP is a browser-encoded copy of `landscape.png`.
