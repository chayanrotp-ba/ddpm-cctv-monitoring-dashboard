"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mimeTypes = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8" };
const port = Number(process.env.PORT || 4173);

http.createServer((request, response) => {
  const relativePath = decodeURIComponent((request.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.writeHead(200, { "Content-Type":mimeTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
