"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "data", "dpm-provinces.geojson");
const geojsonPath = path.join(root, "data", "dpm-provinces-basin09.geojson");
const scriptPath = path.join(root, "data", "dpm-provinces-basin09.js");
const provinceNames = new Set(["น่าน", "อุตรดิตถ์", "พิษณุโลก", "นครสวรรค์"]);

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const subset = {
  type:"FeatureCollection",
  name:"DPM provinces intersecting Nan basin",
  source:"DDPM DPM_TH_Boundary FeatureServer/1",
  crs:{type:"name",properties:{name:"urn:ogc:def:crs:OGC:1.3:CRS84"}},
  features:source.features.filter(feature => provinceNames.has(feature.properties.PROV_NAM_T))
};

fs.writeFileSync(geojsonPath, JSON.stringify(subset));
fs.writeFileSync(scriptPath, `window.DPM_BASIN_PROVINCES=${JSON.stringify(subset)};\n`);
console.log(`${subset.features.length} provinces`);
console.log(geojsonPath);
console.log(scriptPath);
