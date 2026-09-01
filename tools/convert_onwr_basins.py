"""Convert the public ONWR 22-basin shapefile to browser-ready WGS84 data.

Source catalog:
https://data.go.th/th/dataset/dataset_32_013
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import shapefile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source" / "onwr22" / "MainBasin_ONWR_Law_WGS84.shp"
GEOJSON_TARGET = ROOT / "data" / "onwr-basins-22.geojson"
JS_TARGET = ROOT / "data" / "onwr-basins-22.js"

THAI_NAMES = {
    "01": "สาละวิน",
    "02": "โขงเหนือ",
    "03": "โขงตะวันออกเฉียงเหนือ",
    "04": "ชี",
    "05": "มูล",
    "06": "ปิง",
    "07": "วัง",
    "08": "ยม",
    "09": "น่าน",
    "10": "เจ้าพระยา",
    "11": "สะแกกรัง",
    "12": "ป่าสัก",
    "13": "ท่าจีน",
    "14": "แม่กลอง",
    "15": "บางปะกง",
    "16": "โตนเลสาบ",
    "17": "ชายฝั่งทะเลตะวันออก",
    "18": "เพชรบุรี-ประจวบคีรีขันธ์",
    "19": "ภาคใต้ฝั่งตะวันออกตอนบน",
    "20": "ทะเลสาบสงขลา",
    "21": "ภาคใต้ฝั่งตะวันออกตอนล่าง",
    "22": "ภาคใต้ฝั่งตะวันตก",
}


def utm47n_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """Inverse UTM Zone 47N conversion using WGS84 ellipsoid."""
    a = 6378137.0
    ecc_squared = 0.00669438
    k0 = 0.9996
    x = easting - 500000.0
    y = northing
    long_origin = 99.0
    ecc_prime_squared = ecc_squared / (1.0 - ecc_squared)
    m = y / k0
    mu = m / (a * (1.0 - ecc_squared / 4.0 - 3.0 * ecc_squared**2 / 64.0 - 5.0 * ecc_squared**3 / 256.0))
    e1 = (1.0 - math.sqrt(1.0 - ecc_squared)) / (1.0 + math.sqrt(1.0 - ecc_squared))
    phi1_rad = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1**3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1**2 / 16.0 - 55.0 * e1**4 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * e1**3 / 96.0) * math.sin(6.0 * mu)
        + (1097.0 * e1**4 / 512.0) * math.sin(8.0 * mu)
    )
    n1 = a / math.sqrt(1.0 - ecc_squared * math.sin(phi1_rad) ** 2)
    t1 = math.tan(phi1_rad) ** 2
    c1 = ecc_prime_squared * math.cos(phi1_rad) ** 2
    r1 = a * (1.0 - ecc_squared) / (1.0 - ecc_squared * math.sin(phi1_rad) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1_rad - (n1 * math.tan(phi1_rad) / r1) * (
        d**2 / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1**2 - 9.0 * ecc_prime_squared) * d**4 / 24.0
        + (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1**2 - 252.0 * ecc_prime_squared - 3.0 * c1**2) * d**6 / 720.0
    )
    lon = (
        d
        - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1**2 + 8.0 * ecc_prime_squared + 24.0 * t1**2) * d**5 / 120.0
    ) / math.cos(phi1_rad)
    return round(long_origin + math.degrees(lon), 6), round(math.degrees(lat), 6)


def perpendicular_distance(point, start, end):
    if start == end:
        return math.dist(point, start)
    x, y = point
    x1, y1 = start
    x2, y2 = end
    numerator = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    denominator = math.hypot(y2 - y1, x2 - x1)
    return numerator / denominator


def simplify(points, tolerance=650.0):
    if len(points) <= 4:
        return points
    closed = points[0] == points[-1]
    work = points[:-1] if closed else points

    def dp(items):
        if len(items) <= 2:
            return items
        start, end = items[0], items[-1]
        index, max_distance = 0, 0.0
        for idx, point in enumerate(items[1:-1], 1):
            distance = perpendicular_distance(point, start, end)
            if distance > max_distance:
                index, max_distance = idx, distance
        if max_distance > tolerance:
            left = dp(items[: index + 1])
            right = dp(items[index:])
            return left[:-1] + right
        return [start, end]

    result = dp(work)
    if len(result) < 3:
        result = work[:3]
    if closed:
        result.append(result[0])
    return result


def convert():
    reader = shapefile.Reader(str(SOURCE), encoding="cp874", encodingErrors="replace")
    grouped: dict[str, dict] = {}
    for shape_record in reader.iterShapeRecords():
        record = shape_record.record.as_dict()
        raw_code = str(record["MB_CODE"]).strip()
        code = raw_code.split("-")[0]
        item = grouped.setdefault(
            code,
            {
                "code": code,
                "name_th": THAI_NAMES[code],
                "name_en": str(record["MBASIN_E"]).replace(" (Island)", "").strip(),
                "area_sqkm": 0.0,
                "polygons": [],
            },
        )
        item["area_sqkm"] += float(record["AREA_SQKM"] or 0)
        shape = shape_record.shape
        part_starts = list(shape.parts) + [len(shape.points)]
        for start, end in zip(part_starts, part_starts[1:]):
            ring_utm = list(shape.points[start:end])
            if len(ring_utm) < 4:
                continue
            ring_utm = simplify(ring_utm)
            ring_wgs84 = [utm47n_to_wgs84(x, y) for x, y in ring_utm]
            if ring_wgs84[0] != ring_wgs84[-1]:
                ring_wgs84.append(ring_wgs84[0])
            item["polygons"].append([ring_wgs84])

    features = []
    for code in sorted(grouped):
        item = grouped[code]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "code": item["code"],
                    "name_th": item["name_th"],
                    "name_en": item["name_en"],
                    "area_sqkm": round(item["area_sqkm"], 2),
                    "source": "ONWR",
                },
                "geometry": {"type": "MultiPolygon", "coordinates": item["polygons"]},
            }
        )

    payload = {
        "type": "FeatureCollection",
        "name": "ONWR 22 Main River Basins",
        "source": {
            "title": "พื้นที่ 22 ลุ่มน้ำ ตามพระราชกฤษฎีกากำหนดลุ่มน้ำ",
            "organization": "สำนักงานทรัพยากรน้ำแห่งชาติ",
            "catalog": "https://data.go.th/th/dataset/dataset_32_013",
            "resource_id": "cabd0efd-73af-4652-bc4d-4add382078a5",
            "content_updated": "2021-02-11",
            "access": "Public; no access conditions; license not specified in catalog",
            "conversion": "Source CRS WGS 1984 / UTM zone 47N converted to EPSG:4326; geometry simplified to 650 m for web mockup",
        },
        "features": features,
    }
    GEOJSON_TARGET.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    JS_TARGET.write_text("window.ONWR_BASINS=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = convert()
    print(f"Converted {len(result['features'])} basins")
    print(f"GeoJSON: {GEOJSON_TARGET.stat().st_size:,} bytes")
    print(f"JavaScript: {JS_TARGET.stat().st_size:,} bytes")
