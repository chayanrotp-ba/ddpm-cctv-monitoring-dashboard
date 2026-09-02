"use strict";

import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = path.resolve(import.meta.dirname, "..");
const source = process.argv[2];
if (!source) throw new Error("Usage: node tools/build-monitor-data.mjs <daily-report.xlsx>");

const provinceRegions = {
  "เชียงใหม่":"ภาคเหนือ", "เชียงราย":"ภาคเหนือ", "ลำปาง":"ภาคเหนือ", "แม่ฮ่องสอน":"ภาคเหนือ",
  "น่าน":"ภาคเหนือ", "แพร่":"ภาคเหนือ", "อุตรดิตถ์":"ภาคเหนือ", "ตาก":"ภาคเหนือ",
  "อ่างทอง":"ภาคกลาง", "พระนครศรีอยุธยา":"ภาคกลาง", "ชัยนาท":"ภาคกลาง", "กาญจนบุรี":"ภาคกลาง",
  "เพชรบุรี":"ภาคกลาง", "สิงห์บุรี":"ภาคกลาง", "ชัยภูมิ":"ภาคตะวันออกเฉียงเหนือ", "ขอนแก่น":"ภาคตะวันออกเฉียงเหนือ",
  "จันทบุรี":"ภาคตะวันออก", "นราธิวาส":"ภาคใต้", "พัทลุง":"ภาคใต้", "ปัตตานี":"ภาคใต้",
  "ระนอง":"ภาคใต้", "สตูล":"ภาคใต้", "ยะลา":"ภาคใต้"
};

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = workbook.worksheets.getItemAt(0);
const rows = sheet.getRange("A6:L185").values.filter(row => row[1]);
const stations = rows.map(row => {
  const camera1Online = String(row[6] || "").trim() === "✓";
  const camera2Online = String(row[7] || "").trim() === "✓";
  const status = camera1Online && camera2Online ? "online" : camera1Online || camera2Online ? "delay" : "offline";
  const province = String(row[5] || "ไม่ระบุ").trim();
  return {
    no:Number(row[0]), code:String(row[1]).trim(), name:String(row[2] || "—").trim(),
    subdistrict:String(row[3] || "—").trim(), district:String(row[4] || "—").trim(), province,
    region:provinceRegions[province] || "ไม่ระบุ", camera1:camera1Online, camera2:camera2Online,
    waterAvailable:String(row[8] || "").trim() === "✓", waterValue:String(row[9] || "—").trim(),
    time:String(row[10] || "—").trim(), note:String(row[11] || "").trim(), status
  };
});

const metadata = {source:path.basename(source),sheet:sheet.name,date:"2 กันยายน 2569",time:"08:30 น.",total:stations.length};
const output = `window.MONITOR_META=${JSON.stringify(metadata)};\nwindow.MONITOR_STATIONS=${JSON.stringify(stations)};\n`;
await fs.writeFile(path.join(root, "data", "monitor-stations.js"), output, "utf8");
console.log(`Generated ${stations.length} monitor stations from ${metadata.source}`);
