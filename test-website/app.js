"use strict";

// The test bench never calls the extension or intercepts its context menu.
// These fixtures deliberately leave native right-click behavior intact.
const svgArtwork = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480">
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#14192e"/><stop offset="1" stop-color="#371e48"/></linearGradient></defs>
  <path fill="url(#sky)" d="M0 0h960v480H0z"/>
  <g fill="#b6c9e5"><circle cx="105" cy="76" r="2"/><circle cx="284" cy="54" r="2"/><circle cx="816" cy="94" r="3"/><circle cx="750" cy="40" r="2"/><circle cx="412" cy="103" r="2"/></g>
  <circle cx="650" cy="205" r="99" fill="#ff3daf"/>
  <path d="M540 185h220m-220 20h220m-220 20h220m-220 20h220m-220 20h220m-220 20h220" stroke="#251a39" stroke-width="7"/>
  <path d="m0 355 166-184 188 203 153-123 171 133 130-111 152 90v117H0" fill="#0b1428" stroke="#637291" stroke-width="2"/>
  <path d="m0 408 262-140 210 158 192-104 296 104v54H0" fill="#101c31" stroke="#32f6ff" stroke-width="3"/>
  <path d="M0 438h960M0 458h960m-480-32-120 54m120-54 120 54m-120-54-360 54m360-54 360 54" stroke="#32f6ff" stroke-opacity=".28"/>
  <text x="38" y="453" fill="#d7e9ff" font-family="monospace" font-size="16" letter-spacing="2">SVG / VECTOR SOURCE</text>
</svg>`;

function drawCanvas(canvas, label) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.fillStyle = "#10192c";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ff3daf";
  context.beginPath();
  context.arc(width * 0.69, height * 0.43, height * 0.22, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#0c2336";
  context.strokeStyle = "#32f6ff";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, height * 0.9);
  context.lineTo(width * 0.3, height * 0.35);
  context.lineTo(width * 0.58, height * 0.87);
  context.lineTo(width * 0.78, height * 0.6);
  context.lineTo(width, height * 0.9);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#d7e9ff";
  context.font = `${Math.round(height * 0.045)}px monospace`;
  context.fillText(label, width * 0.04, height * 0.12);
}

const dataCanvas = document.createElement("canvas");
dataCanvas.width = 960;
dataCanvas.height = 480;
drawCanvas(dataCanvas, "PNG / EMBEDDED DATA");
const pngDataUrl = dataCanvas.toDataURL("image/png");
const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svgArtwork)}`;
const blobUrl = URL.createObjectURL(new Blob([svgArtwork], { type: "image/svg+xml" }));

const cases = [
  {
    id: "png", category: "formats", title: "PNG", tag: "PNG / 960 × 480",
    description: "<img> with a relative PNG URL.",
    expected: "Saves <code>landscape.png</code> to <code>Saved Images/</code> without a file picker.",
    markup: '<img src="assets/landscape.png" alt="Neon mountain landscape">',
    sample: '<img src="assets/landscape.png" width="960" height="480" alt="Cyan mountains and a magenta sun, PNG fixture">'
  },
  {
    id: "jpeg", category: "formats", title: "JPEG", tag: "JPEG / LOSSY",
    description: "<img> with a JPEG URL.",
    expected: "Saves <code>landscape.jpg</code> without re-encoding.",
    markup: '<img src="assets/landscape.jpg" alt="JPEG landscape">',
    sample: '<img src="assets/landscape.jpg" width="960" height="480" alt="Neon mountain landscape, JPEG fixture">'
  },
  {
    id: "gif", category: "formats", title: "GIF", tag: "GIF / SINGLE FRAME",
    description: "<img> with a single-frame GIF URL.",
    expected: "Saves <code>landscape.gif</code> without re-encoding.",
    markup: '<img src="assets/landscape.gif" alt="GIF landscape">',
    sample: '<img src="assets/landscape.gif" width="960" height="480" alt="Neon mountain landscape, single-frame GIF fixture">'
  },
  {
    id: "webp", category: "formats", title: "WebP", tag: "WEBP",
    description: "<img> with a WebP URL.",
    expected: "Saves <code>landscape.webp</code> without re-encoding.",
    markup: '<img src="assets/landscape.webp" alt="WebP landscape">',
    sample: '<img src="assets/landscape.webp" width="960" height="480" alt="Neon mountain landscape, WebP fixture">'
  },
  {
    id: "svg-file", category: "formats", title: "External SVG", tag: "SVG / EXTERNAL FILE",
    description: "<img> with an SVG URL.",
    expected: "Saves <code>landscape.svg</code> as SVG source.",
    markup: '<img src="assets/landscape.svg" alt="Vector landscape">',
    sample: '<img src="assets/landscape.svg" width="960" height="480" alt="Cyan mountains and a magenta sun, SVG fixture">'
  },
  {
    id: "transparent", category: "formats", title: "Transparent PNG", tag: "PNG / ALPHA CHANNEL",
    description: "PNG with transparency over a CSS checkerboard.",
    expected: "Saves <code>transparent.png</code> with transparency, excluding the checkerboard and label.",
    markup: '<img src="assets/transparent.png" alt="Transparent mountain emblem">',
    sample: '<img class="transparent-image" src="assets/transparent.png" width="480" height="240" alt="Mountain emblem on a transparent PNG background">'
  },
  {
    id: "linked", category: "embedding", title: "Linked image", tag: "IMAGE URL ≠ LINK TARGET",
    description: "PNG inside a download link to a different SVG file.",
    expected: "Saves <code>landscape-small.png</code>. The link target and <code>download</code> attribute are ignored.",
    markup: '<a href="assets/landscape.svg" download="link-target.svg">\n  <img src="assets/landscape-small.png" alt="Thumbnail">\n</a>',
    sample: '<a href="assets/landscape.svg" download="link-target.svg" aria-label="Download the linked SVG"><img src="assets/landscape-small.png" width="480" height="240" alt="PNG thumbnail linking to a different SVG image"></a>'
  },
  {
    id: "srcset", category: "embedding", title: "srcset", tag: "480w / 960w",
    description: "Two PNG candidates selected by viewport size and pixel density.",
    expected: "Saves Firefox’s selected image source, usually <code>currentSrc</code>. Compare with the resolved source below.",
    markup: '<img src="assets/landscape.png"\n  srcset="assets/landscape-small.png 480w, assets/landscape.png 960w"\n  sizes="(max-width: 700px) 100vw, 440px" alt="Responsive scene">',
    sample: '<img src="assets/landscape.png" srcset="assets/landscape-small.png 480w, assets/landscape.png 960w" sizes="(max-width: 700px) 100vw, 440px" width="960" height="480" alt="Responsive landscape selected from two PNG sizes">'
  },
  {
    id: "picture", category: "embedding", title: "picture", tag: "SVG WIDE / JPEG NARROW",
    description: "<picture> with an SVG source at 800 px and above, otherwise JPEG.",
    expected: "Saves <code>landscape.svg</code> at ≥800 px, otherwise <code>landscape.jpg</code>. Resize to test both.",
    markup: '<picture>\n  <source media="(min-width: 800px)" srcset="assets/landscape.svg" type="image/svg+xml">\n  <img src="assets/landscape.jpg" alt="Art-directed scene">\n</picture>',
    sample: '<picture><source media="(min-width: 800px)" srcset="assets/landscape.svg" type="image/svg+xml"><img src="assets/landscape.jpg" width="960" height="480" alt="SVG on wide screens, JPEG on narrow screens"></picture>'
  },
  {
    id: "lazy", category: "embedding", title: "Native lazy loading", tag: 'loading="lazy"',
    description: "PNG with loading=lazy. Wait for it to load before testing.",
    expected: "Saves <code>landscape.png</code> after the image has loaded.",
    markup: '<img src="assets/landscape.png" loading="lazy"\n  width="960" height="480" alt="Lazy landscape">',
    sample: '<img src="assets/landscape.png" loading="lazy" width="960" height="480" alt="Lazy-loaded neon mountain landscape">'
  },
  {
    id: "dynamic", category: "embedding", title: "Dynamic src", tag: "PNG ↔ SVG",
    description: "The button switches src between PNG and SVG. Reopen the context menu after switching.",
    expected: "Saves the current source: <code>landscape.png</code> or <code>landscape.svg</code>.",
    markup: '<img id="changing-image" src="assets/landscape.png" alt="Switchable scene">\n<!-- The button changes src between PNG and SVG. -->',
    sample: '<img id="changing-image" src="assets/landscape.png" width="960" height="480" alt="Switchable landscape, currently PNG">',
    action: '<button class="sample-button" id="switch-source" type="button">Switch to SVG ↗</button>'
  },
  {
    id: "frame", category: "embedding", title: "iframe", tag: "SAME-ORIGIN FRAME",
    description: "PNG inside a same-origin iframe.",
    expected: "Saves <code>landscape-small.png</code> from the frame.",
    markup: '<iframe src="frame.html" title="Image inside a frame"></iframe>\n<!-- frame.html contains <img src="assets/landscape-small.png"> -->',
    sample: '<iframe src="frame.html" title="PNG image in a same-origin frame" loading="lazy"></iframe>',
    source: "assets/landscape-small.png"
  },
  {
    id: "base64", category: "data", title: "Base64 PNG", tag: "data:image/png;base64,…",
    description: "<img> with a base64 PNG data URL.",
    expected: "Saves <code>image-YYYY-MM-DD_HH-MM-SS.png</code>, using local time.",
    markup: '<img src="data:image/png;base64,…" alt="Embedded PNG">',
    sample: `<img src="${pngDataUrl}" width="960" height="480" alt="Neon landscape embedded as a base64 PNG data URL">`
  },
  {
    id: "data-svg", category: "data", title: "SVG data URL", tag: "data:image/svg+xml,…",
    description: "<img> with URL-encoded SVG in a data URL.",
    expected: "Saves <code>image-YYYY-MM-DD_HH-MM-SS.svg</code>; <code>svg+xml</code> maps to <code>.svg</code>.",
    markup: '<img src="data:image/svg+xml,%3Csvg…%3E" alt="Embedded vector">',
    sample: `<img src="${svgDataUrl}" width="960" height="480" alt="Neon landscape embedded as a URL-encoded SVG data URL">`
  },
  {
    id: "x-png", category: "data", title: "image/x-png", tag: "LEGACY PNG MIME TYPE",
    description: "PNG data URL with the image/x-png MIME alias.",
    expected: "Saves <code>image-YYYY-MM-DD_HH-MM-SS.png</code>; the alias maps to <code>.png</code>.",
    markup: '<img src="data:image/x-png;base64,…" alt="Legacy MIME PNG">',
    sample: `<img src="${pngDataUrl.replace("image/png", "image/x-png")}" width="960" height="480" alt="PNG data URL using the image/x-png MIME alias">`
  },
  {
    id: "query", category: "filenames", title: "Query string & fragment", tag: "?size=large#preview",
    description: "PNG URL with query parameters and a fragment.",
    expected: "Saves <code>landscape.png</code>, excluding the query and fragment from the filename.",
    markup: '<img src="assets/landscape.png?size=large&amp;test=download#preview" alt="Query example">',
    sample: '<img src="assets/landscape.png?size=large&amp;test=download#preview" width="960" height="480" alt="PNG with query parameters and a URL fragment">'
  },
  {
    id: "format-hint", category: "filenames", title: "Format query parameter", tag: "?format=png",
    description: "Extensionless PNG URL with format=png.",
    expected: "Saves <code>format-image.png</code>, deriving the extension from <code>format=png</code>.",
    markup: '<img src="assets/format-image?format=png" alt="Format query PNG">',
    sample: '<img src="assets/format-image?format=png" width="960" height="480" alt="PNG loaded from an extensionless URL with a format hint">'
  },
  {
    id: "unknown-extension", category: "filenames", title: "Extensionless URL", tag: "UNKNOWN URL FORMAT",
    description: "PNG URL without an extension or format hint.",
    expected: "Saves <code>unknown-image</code> without an extension. In browser-selected filename mode, Firefox may add one.",
    markup: '<img src="assets/unknown-image" alt="Extensionless PNG">',
    sample: '<img src="assets/unknown-image" width="960" height="480" alt="PNG fixture at a URL without a filename extension">'
  },
  {
    id: "unicode", category: "filenames", title: "Unicode filename", tag: "UTF-8 / URL DECODING",
    description: "Percent-encoded filename with a space and Unicode characters.",
    expected: "Saves <code>Grüße 東京.png</code> with decoded, intact Unicode characters.",
    markup: '<img src="assets/Gr%C3%BC%C3%9Fe%20%E6%9D%B1%E4%BA%AC.png" alt="Unicode filename">',
    sample: '<img src="assets/Gr%C3%BC%C3%9Fe%20%E6%9D%B1%E4%BA%AC.png" width="960" height="480" alt="PNG with a filename containing German and Japanese characters">'
  },
  {
    id: "blob", category: "boundaries", title: "Blob URL", tag: "blob: / UNSUPPORTED", limited: true, support: "UNSUPPORTED",
    description: "<img> with a page-owned SVG blob URL.",
    expected: "No download. The add-on’s menu entry is hidden for <code>blob:</code> URLs.",
    markup: 'const url = URL.createObjectURL(\n  new Blob([svg], { type: "image/svg+xml" })\n);\nimage.src = url;',
    sample: `<img src="${blobUrl}" width="960" height="480" alt="SVG displayed from a page-owned blob URL">`
  },
  {
    id: "background", category: "boundaries", title: "CSS background", tag: "CSS / UNSUPPORTED", limited: true, support: "UNSUPPORTED",
    description: "<div> with a CSS background-image.",
    expected: "No download. Firefox does not expose a CSS background as an image context to this add-on, so its menu entry is hidden.",
    markup: '<div style="background-image: url(assets/landscape.svg)"></div>',
    sample: '<div role="img" aria-label="Neon landscape set as a CSS background" style="background: url(assets/landscape.svg) center / cover no-repeat"></div>',
    source: "CSS background URL; Firefox does not pass it as an image source to the add-on."
  },
  {
    id: "canvas", category: "boundaries", title: "Canvas", tag: "CANVAS / UNSUPPORTED", limited: true, support: "UNSUPPORTED",
    description: "Drawing on a <canvas> without an image URL.",
    expected: "No download. Firefox reports a canvas context without an image URL, so the add-on menu entry is hidden.",
    markup: '<canvas width="960" height="480"></canvas>\n// Scene drawn with canvas.getContext("2d").',
    sample: '<canvas id="canvas-fixture" width="960" height="480" role="img" aria-label="Neon landscape drawn directly on a canvas">Canvas scene; no image URL.</canvas>',
    source: "Canvas pixels; Firefox does not provide an image srcUrl to the add-on."
  },
  {
    id: "inline-svg", category: "boundaries", title: "Inline SVG", tag: "INLINE MARKUP / NO FILE URL", limited: true, support: "UNSUPPORTED",
    description: "<svg> markup embedded directly in the page.",
    expected: "No image URL to download. The add-on cannot export inline SVG; its image action is generally absent.",
    markup: '<svg viewBox="0 0 960 480">\n  <!-- Vector shapes are part of this document. -->\n</svg>',
    sample: svgArtwork.replace('<svg xmlns=', '<svg role="img" aria-label="Inline SVG landscape without an image source URL" xmlns='),
    source: "Inline SVG markup; no image URL."
  },
  {
    id: "broken", category: "boundaries", title: "Missing image (404)", tag: "HTTP 404", limited: true, support: "ERROR TEST",
    description: "<img> pointing to a missing file.",
    expected: "No successful download. If the add-on action is available, the request fails and a red <code>!</code> badge appears on the toolbar button. Hover for the reason. The tab stays open.",
    markup: '<img src="assets/intentionally-missing.png" alt="Intentionally missing image">',
    sample: '<img class="broken-image" src="assets/intentionally-missing.png" width="960" height="480" alt="Intentionally missing image · expected HTTP 404">'
  }
];

const categoryNames = { formats: "FILE FORMAT", embedding: "EMBEDDING", data: "DATA URL", filenames: "FILENAME", boundaries: "BOUNDARY" };
const grid = document.querySelector("#test-cases");
const cards = new Map();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

for (const [index, test] of cases.entries()) {
  const article = document.createElement("article");
  article.className = `test-card${test.limited ? " limited-case" : ""}`;
  article.id = `case-${test.id}`;
  article.setAttribute("aria-labelledby", `title-${test.id}`);
  article.innerHTML = `
    <div class="card-top"><span class="case-number">${String(index + 1).padStart(2, "0")}</span><span class="category">${categoryNames[test.category]}</span><span class="badge${test.limited ? " limited" : ""}">${test.support || "SUPPORTED"}</span></div>
    <div class="sample">${test.sample}<span class="sample-tag">${escapeHtml(test.tag)}</span></div>
    <div class="card-body">
      <h3 id="title-${test.id}">${escapeHtml(test.title)}</h3>
      <p class="description">${escapeHtml(test.description)}</p>
      <p class="expected"><strong>Expected behavior</strong>${test.expected}</p>
      <div class="card-actions">${test.action || ""}</div>
      <details><summary>Inspect embedding &amp; source</summary><pre><code>${escapeHtml(test.markup)}</code></pre><p class="source-label">${test.id === "frame" ? "IMAGE INSIDE FRAME" : "RESOLVED SOURCE"}</p><code class="resolved-source"></code></details>
    </div>
  `;
  grid.append(article);
  cards.set(test.id, article);
  const image = article.querySelector(".sample img");
  if (image) {
    image.addEventListener("load", () => updateSource(test, article));
    image.addEventListener("error", () => updateSource(test, article));
  }
  article.querySelector("details").addEventListener("toggle", () => updateSource(test, article));
  updateSource(test, article);
}

function updateSource(test, article) {
  const image = article.querySelector(".sample img");
  let value = test.source || image?.currentSrc || image?.src || "No image URL.";
  if (value.startsWith("data:")) {
    value = `${value.slice(0, value.indexOf(",") + 1)}… [${value.length.toLocaleString("en-US")} characters; content omitted]`;
  } else if (test.source?.startsWith("assets/")) {
    value = new URL(test.source, document.baseURI).href;
  }
  article.querySelector(".resolved-source").textContent = value;
}

drawCanvas(document.querySelector("#canvas-fixture"), "CANVAS / NO SRC ATTRIBUTE");

document.querySelector("#switch-source").addEventListener("click", (event) => {
  const image = document.querySelector("#changing-image");
  const nextIsSvg = !image.getAttribute("src").endsWith(".svg");
  image.src = `assets/landscape.${nextIsSvg ? "svg" : "png"}`;
  image.alt = `Switchable landscape, currently ${nextIsSvg ? "SVG" : "PNG"}`;
  event.currentTarget.textContent = `Switch to ${nextIsSvg ? "PNG" : "SVG"} ↗`;
  updateSource(cases.find((test) => test.id === "dynamic"), cards.get("dynamic"));
});

let activeFilter = "all";

function filterCases() {
  let visible = 0;
  for (const test of cases) {
    const card = cards.get(test.id);
    card.hidden = activeFilter !== "all" && test.category !== activeFilter;
    if (!card.hidden) visible++;
  }
  document.querySelector("#visible-count").textContent = `${visible} of ${cases.length} cases`;
  document.querySelector("#empty-state").hidden = visible !== 0;
}

document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  filterCases();
}));

window.addEventListener("resize", () => {
  for (const test of cases) updateSource(test, cards.get(test.id));
});
// Keep page-owned blob URLs alive while in use, including in the back/forward cache.
window.addEventListener("pagehide", (event) => { if (!event.persisted) URL.revokeObjectURL(blobUrl); });
document.querySelector("#protocol-notice").hidden = location.protocol !== "file:";
document.querySelector("#total-count").textContent = cases.length;
filterCases();
