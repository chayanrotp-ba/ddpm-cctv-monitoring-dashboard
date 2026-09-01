"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const downloads = path.join(process.env.USERPROFILE || "C:\\Users\\chaya", "Downloads");
const markers = {
  yellow: "CCTV_WATER_HIGH.svg",
  orange: "CCTV_WATER_DANGER.svg",
  red: "CCTV_WATER_SUPERCRITICAL.svg"
};

const embedded = Object.fromEntries(Object.entries(markers).map(([severity, filename]) => {
  const svg = fs.readFileSync(path.join(downloads, filename));
  return [severity, `data:image/svg+xml;base64,${svg.toString("base64")}`];
}));

const output = `window.CCTV_MARKER_URLS=${JSON.stringify(embedded)};\n`;
fs.writeFileSync(path.join(root, "data", "cctv-markers.js"), output, "utf8");
console.log("Embedded CCTV marker assets:", Object.keys(embedded).join(", "));
