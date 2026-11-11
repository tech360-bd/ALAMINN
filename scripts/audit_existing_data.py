#!/usr/bin/env python3
"""
ALO Education — Existing university & course data audit (Phase 1).
Parses the 4 uploaded operational spreadsheets, normalises universities,
detects duplicates/conflicts/gaps, cross-checks against the 27 priority
UK universities, and emits a structured audit JSON.

No value is invented: cells are captured verbatim as `raw` plus a best-effort
parsed form when the pattern is unambiguous (e.g. "6/5.5" -> overall 6.0, min 5.5).
"""
import json, re, os
from openpyxl import load_workbook

UP = "/home/z/my-project/upload"
OUT = "/home/z/my-project/scripts/audit/alo_audit.json"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

FILES = {
    "product_list_bd": "Product List_Bangladesh.xlsx",
    "alo_bd_2026": "ALO BD Entry Requirements\xa0For\xa02026 .xlsx",
    "australia_cheatsheet": "Bangladesh - Australia University Cheatsheet.xlsx",
    "kampus_2027": "Kampus BD Entry Requirements\xa0For\xa02027\xa0Partners.xlsx",
}

# 27 priority UK universities (verbatim from master implementation prompt Part 2 §4)
PRIORITY_27 = [
    "University of Leicester", "University of East London", "Aston University",
    "Edinburgh Napier University", "Swansea University", "Teesside University",
    "Nottingham Trent University", "Liverpool Hope University", "Bangor University",
    "University of Hull", "Abertay University", "Cardiff Metropolitan University",
    "University of Gloucestershire", "University of the West of Scotland",
    "University of Portsmouth", "University of Liverpool", "University of Plymouth",
    "University of Bradford", "University of Salford", "University of Lincoln",
    "University of Derby", "Goldsmiths, University of London",
    "Queen Mary University of London", "University of Bath", "Anglia Ruskin University",
    "Heriot-Watt University", "Bath Spa University",
]

# Alias map: known internal-name variants -> canonical priority name
ALIASES = {
    "UEL": "University of East London",
    "University of East London (UEL)": "University of East London",
    "Aston University - London Campus": "Aston University",
    "Aston University- Birmingham": "Aston University",
    "Aston University, London": "Aston University",
    "Aston University, Birmingham": "Aston University",
    "Teesside University": "Teesside University",
    "Abertay University": "Abertay University",
    "Cardiff Metropolitan University": "Cardiff Metropolitan University",
    "University of Gloucestershire": "University of Gloucestershire",
    "UWS - London Campus": "University of the West of Scotland",
    "UWS - London Campus ": "University of the West of Scotland",
    "University of Portsmouth": "University of Portsmouth",
    "University of Bradford": "University of Bradford",
    "University of Hull": "University of Hull",
    "University of Hull - London Campus": "University of Hull",
    "University of Hull (London campus)": "University of Hull",
    "University of Derby": "University of Derby",
    "Anglia Ruskin University": "Anglia Ruskin University",
    "Anglia Ruskin University, London": "Anglia Ruskin University",
    "Anglia Ruskin University College": "Anglia Ruskin University",
}

def norm_name(raw):
    if not raw:
        return None
    n = re.sub(r"\s+", " ", str(raw)).strip()
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)  # strip trailing parenthetical qualifiers
    n = n.rstrip("*- ").strip()
    return n

def canonical(raw):
    n = norm_name(raw)
    if not n:
        return None, None
    if n in ALIASES:
        return ALIASES[n], n
    # try alias keys by prefix match on normalized raw
    rawn = re.sub(r"\s+", " ", str(raw)).strip()
    for k, v in ALIASES.items():
        if rawn.lower().startswith(k.lower()):
            return v, n
    return n, n

def sheet_rows(path, sheet):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet]
    rows = []
    for row in ws.iter_rows(values_only=True):
        if any(c is not None and str(c).strip() not in ("", "*") for c in row):
            rows.append([("" if c is None else str(c).strip()) for c in row])
    return rows

def parse_score(raw):
    """Parse '6/5.5' style overall/minimum scores. Returns dict or None."""
    if raw is None:
        return None
    s = str(raw).strip()
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", s)
    if m:
        return {"overall": float(m.group(1)), "minimum": float(m.group(2)), "raw": s}
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", s)
    if m:
        return {"overall": float(m.group(1)), "minimum": None, "raw": s}
    return None

def is_unknown(v):
    if v is None:
        return True
    s = str(v).strip().lower()
    return s in ("", "*", "-", "n/a", "na", "n\\a", "tba", "no data", "none", "tbd", "?")

audit = {"generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
         "files": {}, "universities": {}, "priority27_coverage": [], "issues": []}
uni_index = audit["universities"]

def add_record(uname_raw, file_key, sheet, row_idx, headers, row, source_url=None):
    canon, norm = canonical(uname_raw)
    if not canon:
        return
    u = uni_index.setdefault(canon, {
        "canonical_name": canon, "as_written": set(), "records": [], "sheets": set(),
        "countries": set(), "source_urls": set(),
    })
    u["as_written"].add(re.sub(r"\s+", " ", str(uname_raw)).strip())
    u["sheets"].add(f"{file_key}::{sheet}")
    rec = {"file": file_key, "sheet": sheet, "row": row_idx,
           "fields": {h: (None if is_unknown(v) else str(v).strip()) for h, v in zip(headers, row) if h}}
    if source_url:
        u["source_urls"].add(source_url)
    u["records"].append(rec)

def detect_country(sheet, file_key):
    s = (sheet + " " + file_key).lower()
    if "australia" in s or "cheatsheet" in s:
        return "Australia"
    if "newzealand" in s or "new zealand" in s:
        return "New Zealand"
    if "uk" in s or "bangladesh" in s or "sylhet" in s or "moi" in s or "dbaphd" in s:
        return "United Kingdom"
    return "Unknown"

# ---------- 1. Product List_Bangladesh.xlsx ----------
f = os.path.join(UP, FILES["product_list_bd"])
wb = load_workbook(f, data_only=True)
audit["files"]["product_list_bd"] = {"sheets": wb.sheetnames}
for sheet in wb.sheetnames:
    rows = sheet_rows(f, sheet)
    if not rows:
        continue
    # header = first row with a university-name-like column
    hdr_i, name_col = 0, None
    for i, r in enumerate(rows[:4]):
        for j, c in enumerate(r):
            if c and "university" in c.lower():
                hdr_i, name_col = i, j
                break
        if name_col is not None:
            break
    headers = rows[hdr_i]
    for k, r in enumerate(rows[hdr_i + 1:], start=hdr_i + 1):
        if name_col is not None and name_col < len(r) and r[name_col] and not is_unknown(r[name_col]):
            name = r[name_col]
            if len(str(name)) < 3 or str(name).lower() in ("note", "note ", "*"):
                continue
            add_record(name, "product_list_bd", sheet, k + 1, headers, r)

# ---------- 2 & 4. ALO 2026 / Kampus 2027 (same layout: university in col index 1) ----------
for file_key in ("alo_bd_2026", "kampus_2027"):
    f = os.path.join(UP, FILES[file_key])
    wb = load_workbook(f, data_only=True)
    audit["files"][file_key] = {"sheets": wb.sheetnames}
    for sheet in wb.sheetnames:
        rows = sheet_rows(f, sheet)
        # find header row containing 'University Name'
        hdr_i = None
        for i, r in enumerate(rows[:4]):
            if any(c and "university" in c.lower() for c in r):
                hdr_i = i
                break
        if hdr_i is None:
            continue
        headers = rows[hdr_i]
        name_col = next(j for j, c in enumerate(headers) if c and "university" in c.lower())
        for k, r in enumerate(rows[hdr_i + 1:], start=hdr_i + 1):
            if name_col < len(r) and r[name_col] and not is_unknown(r[name_col]):
                name = r[name_col]
                if len(str(name)) < 4 or str(name).startswith("*"):
                    continue
                # capture source links present anywhere in the row
                urls = re.findall(r"https?://[^\s|]+", " ".join(r))
                add_record(name, file_key, sheet, k + 1, headers, r, urls[0] if urls else None)

# ---------- 3. Australia cheatsheet (merged university cells -> forward-fill) ----------
f = os.path.join(UP, FILES["australia_cheatsheet"])
wb = load_workbook(f, data_only=True)
audit["files"]["australia_cheatsheet"] = {"sheets": wb.sheetnames}
for sheet in wb.sheetnames:
    rows = sheet_rows(f, sheet)
    if not rows:
        continue
    headers = rows[0]
    last_name = None
    for k, r in enumerate(rows[1:], start=1):
        name_col = 1 if len(r) > 1 else None
        if name_col is not None and r[name_col] and not is_unknown(r[name_col]):
            last_name = r[name_col]
            # study level may sit in Course Name col (2)
            level = r[2] if len(r) > 2 and not is_unknown(r[2]) else None
            add_record(f"{last_name}", "australia_cheatsheet", sheet, k + 1, headers, r)
        elif last_name and len(r) > 1:
            # continuation row of merged cell (levels under same university)
            add_record(f"{last_name}", "australia_cheatsheet", sheet, k + 1, headers, r)

# ---------- freeze sets -> lists, compute per-university stats ----------
for u in uni_index.values():
    u["as_written"] = sorted(u["as_written"])
    u["sheets"] = sorted(u["sheets"])
    u["countries"] = sorted(u["countries"])
    u["source_urls"] = sorted(u["source_urls"])
    u["record_count"] = len(u["records"])

# countries via sheet mapping
for u in uni_index.values():
    for s in u["sheets"]:
        c = detect_country(s.split("::")[1], s.split("::")[0])
        if c != "Unknown":
            u["countries"].append(c)
    u["countries"] = sorted(set(u["countries"])) or ["Unknown"]

# ---------- duplicate / conflict detection ----------
# Same canonical university, multiple sheets, same field (e.g. Tuition Fees) with different non-empty values
FIELD_CONFLICT_KEYS = ["Tuition Fees", "Fees/year", "Initial Deposit", "CAS Deposit", "Master Requirement",
                       "Bachelor Requirement", "Max. Scholarship", "Postgraduate Minimum Requirement"]
for u in uni_index.values():
    seen = {}
    for rec in u["records"]:
        for key in FIELD_CONFLICT_KEYS:
            if key in rec["fields"] and rec["fields"][key]:
                val = rec["fields"][key]
                sig = re.sub(r"\s+", "", val.lower())
                seen.setdefault(key, {}).setdefault(sig, {"value": val, "locations": []})["locations"].append(
                    f"{rec['file']}::{rec['sheet']}:row{rec['row']}")
    for key, variants in seen.items():
        if len(variants) > 1:
            audit["issues"].append({
                "type": "CONFLICTING_INFORMATION",
                "university": u["canonical_name"],
                "field": key,
                "variants": [{**v, "location_count": len(v["locations"])} for v in variants.values()],
            })

# multi-sheet duplicates (same university in >=2 sheets)
for u in uni_index.values():
    if len(u["sheets"]) >= 2:
        audit["issues"].append({
            "type": "MULTI_SHEET_DUPLICATE",
            "university": u["canonical_name"],
            "sheets": u["sheets"],
            "record_count": u["record_count"],
        })

# ---------- priority 27 coverage ----------
for name in PRIORITY_27:
    key = name
    hit = uni_index.get(name) or uni_index.get(ALIASES.get(name, name))
    # also fuzzy: any canonical containing the distinctive part
    if not hit:
        probe = name.lower().replace("university of", "").strip()
        for cn in uni_index:
            if probe and probe in cn.lower():
                hit = uni_index[cn]
                break
    audit["priority27_coverage"].append({
        "university": name,
        "present_in_existing_data": bool(hit),
        "sheets": hit["sheets"] if hit else [],
        "record_count": hit["record_count"] if hit else 0,
        "source_urls_found": hit["source_urls"] if hit else [],
    })

# ---------- summary stats ----------
audit["summary"] = {
    "unique_institutions": len(uni_index),
    "total_rows_with_university": sum(u["record_count"] for u in uni_index.values()),
    "conflicting_fields": sum(1 for i in audit["issues"] if i["type"] == "CONFLICTING_INFORMATION"),
    "multi_sheet_duplicates": sum(1 for i in audit["issues"] if i["type"] == "MULTI_SHEET_DUPLICATE"),
    "priority27_with_existing_data": sum(1 for p in audit["priority27_coverage"] if p["present_in_existing_data"]),
    "priority27_total": len(PRIORITY_27),
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(audit, fh, indent=1, ensure_ascii=False)

print(json.dumps(audit["summary"], indent=2))
print("\nPRIORITY 27 COVERAGE:")
for p in audit["priority27_coverage"]:
    print(f"  {'YES' if p['present_in_existing_data'] else 'NO ':3} {p['university']:45} records={p['record_count']}")
print("\nCONFLICTS (first 15):")
for i in [x for x in audit["issues"] if x["type"] == "CONFLICTING_INFORMATION"][:15]:
    print(f"  {i['university']} | {i['field']} | {len(i['variants'])} variants")
print(f"\nSaved -> {OUT}")
