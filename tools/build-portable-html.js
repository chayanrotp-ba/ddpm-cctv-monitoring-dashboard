"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

let html = read("index.html");
const styles = read("mockup.css");
const basinData = read("data/onwr-basins-22.js");
const app = read("app.js");

html = html
  .replace(/\s*<link rel="preconnect" href="https:\/\/js\.arcgis\.com">/, "")
  .replace(/\s*<link rel="stylesheet" href="https:\/\/js\.arcgis\.com\/4\.31\/esri\/themes\/light\/main\.css">/, "")
  .replace('<link rel="stylesheet" href="mockup.css">', `<style>\n${styles}\n</style>`)
  .replace(/\s*<script src="data\/onwr-basins-22\.js"><\/script>/, () => `<script>\n${basinData}\n</script>`)
  .replace(/\s*<script src="https:\/\/js\.arcgis\.com\/4\.31\/"><\/script>/, "")
  .replace(/\s*<script src="app\.js"><\/script>/, () => `<script>\n${app}\n</script>`)
  .replace("</body>", `  <script>
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href="index.html"], a[href="basin.html"], a[href="monitor.html"]');
      if (!link) return;
      event.preventDefault();
      window.alert("ไฟล์พกพาฉบับนี้เป็นหน้าภาพรวมแบบไฟล์เดียว\\nหากต้องการใช้งานทุกเมนู ให้เปิดชุดไฟล์ต้นฉบับที่มี basin.html และ monitor.html ร่วมด้วย");
    });
  </script>\n</body>`);

const output = path.join(root, "CCTV-Dashboard-Portable.html");
fs.writeFileSync(output, html, "utf8");
console.log(output);
console.log(`${Buffer.byteLength(html, "utf8")} bytes`);
