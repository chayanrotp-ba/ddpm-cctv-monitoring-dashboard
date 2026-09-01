"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const metadataUrl = "https://gis.dwr.go.th/arcgis/rest/services/NAT_STREAM/MapServer/0?f=pjson";
const queryUrl = "https://gis.dwr.go.th/arcgis/rest/services/NAT_STREAM/MapServer/0/query";
const pageSize = 2000;
const supportedBasins = ["09", "08", "04"];

async function requestJson(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json;
    } catch (error) {
      lastError = error;
      console.error(`${label}: attempt ${attempt} failed: ${error.message}`);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 700 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function featureRings(feature) {
  return feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flatMap(polygon => polygon);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > point[1]) !== (yj > point[1])) &&
      point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInBasin(point, basin) {
  return featureRings(basin).some(ring => pointInRing(point, ring));
}

function lineParts(geometry) {
  if (!geometry) return [];
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function touchesBasin(feature, basin) {
  return lineParts(feature.geometry).some(line => {
    const stride = Math.max(1, Math.floor(line.length / 24));
    for (let index = 0; index < line.length; index += stride) {
      if (pointInBasin(line[index], basin)) return true;
    }
    return line.length > 0 && pointInBasin(line[line.length - 1], basin);
  });
}

function simplifyLine(line) {
  if (line.length <= 18) return line;
  const stride = Math.max(1, Math.floor(line.length / 80));
  return line.filter((_, index) => index === 0 || index === line.length - 1 || index % stride === 0);
}

function simplifyGeometry(geometry) {
  return geometry.type === "LineString"
    ? {type:"LineString", coordinates:simplifyLine(geometry.coordinates)}
    : {type:"MultiLineString", coordinates:geometry.coordinates.map(simplifyLine)};
}

async function main() {
  const metadata = await requestJson(metadataUrl, undefined, "metadata");
  console.log(`Layer=${metadata.name} geometry=${metadata.geometryType} maxRecordCount=${metadata.maxRecordCount}`);
  const features = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where:"1=1",
      outFields:"OBJECTID,STR_ID,STR_type,STR_Name_T,STR_Name_E,Shape_Length,sym_c",
      returnGeometry:"true",
      outSR:"4326",
      orderByFields:"OBJECTID ASC",
      resultOffset:String(offset),
      resultRecordCount:String(pageSize),
      f:"geojson"
    });
    const page = await requestJson(queryUrl, {
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded;charset=UTF-8"},
      body:params
    }, `offset ${offset}`);
    const batch = page.features || [];
    features.push(...batch);
    console.log(`offset=${offset} received=${batch.length} total=${features.length}`);
    if (batch.length < pageSize) break;
  }

  const ids = features.map(feature => feature.properties.OBJECTID);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate OBJECTID values found");
  const full = {type:"FeatureCollection",name:"DWR NAT_STREAM Thailand",crs:{type:"name",properties:{name:"EPSG:4326"}},features};
  const fullPath = path.join(dataDir, "dwr_nat_stream_thailand.geojson");
  fs.writeFileSync(fullPath, JSON.stringify(full), "utf8");

  const basins = JSON.parse(fs.readFileSync(path.join(dataDir, "onwr-basins-22.geojson"), "utf8"));
  const byBasin = {};
  for (const code of supportedBasins) {
    const basin = basins.features.find(feature => feature.properties.code === code);
    const selected = features.filter(feature => touchesBasin(feature, basin)).map(feature => ({
      type:"Feature",
      properties:{OBJECTID:feature.properties.OBJECTID,STR_ID:feature.properties.STR_ID,STR_type:feature.properties.STR_type,STR_Name_T:feature.properties.STR_Name_T,sym_c:Number(feature.properties.sym_c)},
      geometry:simplifyGeometry(feature.geometry)
    }));
    byBasin[code] = {type:"FeatureCollection",features:selected};
    console.log(`basin=${code} streams=${selected.length}`);
  }
  const webPath = path.join(dataDir, "dwr-streams-by-basin.js");
  fs.writeFileSync(webPath, `window.DWR_STREAMS_BY_BASIN=${JSON.stringify(byBasin)};\n`, "utf8");

  const bbox = features.flatMap(feature => lineParts(feature.geometry)).flat().reduce((value, point) => [
    Math.min(value[0], point[0]), Math.min(value[1], point[1]), Math.max(value[2], point[0]), Math.max(value[3], point[1])
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  const mainCount = features.filter(feature => Number(feature.properties.sym_c) === 1).length;
  const branchCount = features.filter(feature => Number(feature.properties.sym_c) === 0).length;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  console.log(JSON.stringify({features:features.length,main:mainCount,branches:branchCount,bbox,crs:"EPSG:4326",fullPath,webPath,bytes:fs.statSync(fullPath).size,sha256}, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
