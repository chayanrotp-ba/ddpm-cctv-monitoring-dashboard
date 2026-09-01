"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const queryUrl = "https://gis.dwr.go.th/arcgis/rest/services/NAT_STREAM/MapServer/0/query";
const pageSize = 2000;
const basinCodes = ["09", "08", "04"];

async function request(params, label) {
  let error;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(queryUrl, {method:"POST",headers:{"content-type":"application/x-www-form-urlencoded;charset=UTF-8"},body:new URLSearchParams(params)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json;
    } catch (caught) {
      error = caught;
      console.error(`${label} attempt=${attempt}: ${caught.message}`);
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 800 * 2 ** (attempt - 1)));
    }
  }
  throw error;
}

function rings(feature) {
  return feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flatMap(polygon => polygon);
}

function pointInRing([x,y], ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if (((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi) inside=!inside;
  }
  return inside;
}

function inBasin(point, basin) { return rings(basin).some(ring => pointInRing(point, ring)); }
function parts(geometry) { return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates; }
function touches(feature, basin) {
  return parts(feature.geometry).some(line => {
    const stride=Math.max(1,Math.floor(line.length/32));
    for(let i=0;i<line.length;i+=stride) if(inBasin(line[i],basin)) return true;
    return line.length>0 && inBasin(line[line.length-1],basin);
  });
}
function simplify(line) {
  const stride=Math.max(1,Math.floor(line.length/70));
  return line.filter((_,i)=>i===0||i===line.length-1||i%stride===0);
}
function compact(feature) {
  return {type:"Feature",properties:{OBJECTID:feature.properties.OBJECTID,STR_ID:feature.properties.STR_ID,STR_type:feature.properties.STR_type,STR_Name_T:feature.properties.STR_Name_T,sym_c:Number(feature.properties.sym_c)},geometry:feature.geometry.type==="LineString"?{type:"LineString",coordinates:simplify(feature.geometry.coordinates)}:{type:"MultiLineString",coordinates:feature.geometry.coordinates.map(simplify)}};
}
function bounds(feature) {
  return rings(feature).flat().reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
}

async function count(where) {
  const json=await request({where,returnCountOnly:"true",f:"json"},`count ${where}`);
  return json.count;
}

async function main() {
  const basinCollection=JSON.parse(fs.readFileSync(path.join(dataDir,"onwr-basins-22.geojson"),"utf8"));
  const output={};
  for(const code of basinCodes){
    const basin=basinCollection.features.find(feature=>feature.properties.code===code);
    const [xmin,ymin,xmax,ymax]=bounds(basin);
    const candidates=[];
    for(let offset=0;;offset+=pageSize){
      const page=await request({where:"1=1",geometry:`${xmin},${ymin},${xmax},${ymax}`,geometryType:"esriGeometryEnvelope",inSR:"4326",spatialRel:"esriSpatialRelIntersects",outFields:"OBJECTID,STR_ID,STR_type,STR_Name_T,STR_Name_E,Shape_Length,sym_c",returnGeometry:"true",outSR:"4326",orderByFields:"OBJECTID ASC",resultOffset:String(offset),resultRecordCount:String(pageSize),f:"geojson"},`basin ${code} offset ${offset}`);
      const batch=page.features||[];
      candidates.push(...batch);
      console.log(`basin=${code} offset=${offset} received=${batch.length}`);
      if(batch.length<pageSize) break;
    }
    const unique=[...new Map(candidates.map(feature=>[feature.properties.OBJECTID,feature])).values()];
    const selected=unique.filter(feature=>touches(feature,basin)).map(compact);
    output[code]={type:"FeatureCollection",features:selected};
    console.log(`basin=${code} candidates=${unique.length} selected=${selected.length}`);
  }
  fs.writeFileSync(path.join(dataDir,"dwr-streams-by-basin.js"),`window.DWR_STREAMS_BY_BASIN=${JSON.stringify(output)};\n`,"utf8");
  const metadata={source:"Department of Water Resources NAT_STREAM",crs:"EPSG:4326",featureCount:await count("1=1"),mainCount:await count("sym_c=1"),branchCount:await count("sym_c=0"),generatedAt:new Date().toISOString(),basins:Object.fromEntries(Object.entries(output).map(([code,collection])=>[code,collection.features.length]))};
  fs.writeFileSync(path.join(dataDir,"dwr-streams-meta.json"),JSON.stringify(metadata,null,2),"utf8");
  console.log(JSON.stringify(metadata,null,2));
}

main().catch(error=>{console.error(error);process.exit(1);});
