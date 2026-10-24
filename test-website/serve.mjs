// Optional dependency-free preview server. The site itself is entirely static.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2] || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Use a port between 1 and 65535.");
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const target = await realpath(resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`));
    if (!target.startsWith(root + sep)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }
    const data = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch (error) {
    const status = error instanceof URIError ? 400 : 404;
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }).end(status === 400 ? "Bad request" : "Not found (the missing-image fixture deliberately returns 404).");
  }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Image test bench: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
