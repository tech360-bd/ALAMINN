#!/usr/bin/env python3
"""
ALO Education — Phase 1 data extraction & audit pipeline.
Extracts institutions, programmes and requirement records from the 4 uploaded
operational spreadsheets into a structured dataset (alo_dataset.json) with full
provenance, duplicate/conflict detection and the 27 priority UK universities
coverage check. Every value is captured verbatim (raw); parsed values are added
only where the pattern is unambiguous. Unknown stays unknown.
"""
import json, re, os, datetime
from openpyxl import load_workbook

def _fmt_cell(v):
    """Reconstruct values Excel mangled: fraction scores typed as dates (d/m UK locale)
    and intake month labels typed as dates."""
    if isinstance(v, datetime.datetime):
        if v.month == 1 and v.day == 1:
            return v.strftime("%B %Y")
        return f"{v.day}/{v.month}"  # e.g. 2025-06-07 -> '7/6' (overall 7 / minimum 6)
    return v

UP = "/home/z/my-project/upload"
OUTDIR = "/home/z/my-project/scripts/audit"
os.makedirs(OUTDIR, exist_ok=True)

F_PRODUCT = os.path.join(UP, "Product List_Bangladesh.xlsx")
F_ALO26 = os.path.join(UP, "ALO BD Entry Requirements\xa0For\xa02026 .xlsx")
F_CHEAT = os.path.join(UP, "Bangladesh - Australia University Cheatsheet.xlsx")
F_KAMPUS = os.path.join(UP, "Kampus BD Entry Requirements\xa0For\xa02027\xa0Partners.xlsx")

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

ALIASES = {
    "UEL": "University of East London",
    "Aston University - London Campus": "Aston University",
    "Aston University- Birmingham": "Aston University",
    "Aston University, London": "Aston University",
    "Aston University, Birmingham": "Aston University",
    "Aston University (London, Birmingham)": "Aston University",
    "University of Hull - London Campus": "University of Hull",
    "University of Hull (London campus)": "University of Hull",
    "UWS - London Campus": "University of the West of Scotland",
    "Anglia Ruskin University, London": "Anglia Ruskin University",
    "Anglia Ruskin University College": "Anglia Ruskin University",
    "Ulster University London/Birmingham": "Ulster University",
    "Ulster University London/Birmingham (Only PG)": "Ulster University",
    "Regent College London (MBA only)": "Regent College London",
    "Regent College London (Except UG)": "Regent College London",
    "Regent College London (Except UG Sylhet)": "Regent College London",
    "University of Bedfordshire (Only Dhaka accepted)": "University of Bedfordshire",
    "University of Bedfordshire (Only Dhaka)": "University of Bedfordshire",
    "Buckinghamshire New University (Only PG)": "Buckinghamshire New University",
    "Cardiff Metropolitan University (Except Sylhet)": "Cardiff Metropolitan University",
    "Cardiff Metropolitan University (Full Deposit for Sylhet)": "Cardiff Metropolitan University",
    "London South Bank University (Except Sylhet, Except Business course)": "London South Bank University",
    "University of Law (Except Business Course)": "University of Law",
    "University of South Wales (Except Sylhet)": "University of South Wales",
    "University of Chester (Except Sylhet)": "University of Chester",
    "University of Hertfordshire": "University of Hertfordshire",
    "University of Hartpury": "Hartpury University",
    "Aston University London (Except Sylhet)": "Aston University",
    "University of Hull - London (Except Sylhet)": "University of Hull",
    "Northumbria Newcastle": "Northumbria University",
    "Northumbria University London Campus": "Northumbria University",
    "Northumbria New Castle (Except Sylhet)": "Northumbria University",
    "University of Central Lancashire": "University of Central Lancashire",
    "University of Lancashire": "University of Central Lancashire",
    "University of Greater Manchester": "University of Greater Manchester",
    "University of Wolverhampton": "University of Wolverhampton",
    "UWTSD - University of Wales Trinity Saint David": "University of Wales Trinity Saint David",
    "UWTSD - University of Wales Trinity Saint David (London, Birmingham, Wales)": "University of Wales Trinity Saint David",
    "UWTSD (London, Birmingham, Swansea)": "University of Wales Trinity Saint David",
    "University of Wales Trinity Saint David (UWTSD) (London, Birmingham & Swansea Campus)": "University of Wales Trinity Saint David",
    "University of Wales Trinity Saint David (London, Birmingham": "University of Wales Trinity Saint David",
    "The University of Law": "University of Law",
    "University of Law": "University of Law",
    "BPP University": "BPP University",
    "London South Bank University": "London South Bank University",
    "Canterbury Christ Church University (Except UG)": "Canterbury Christ Church University",
    "Canterbury Christ Church University": "Canterbury Christ Church University",
    "University of Gloucestershire": "University of Gloucestershire",
    "University of Brighton": "University of Brighton",
    "Aberystwyth University": "Aberystwyth University",
    "University of Greenwich": "University of Greenwich",
    "Birmingham City University": "Birmingham City University",
    "Birmingham City University (National MOI is not accepted)": "Birmingham City University",
    "De Montfort University": "De Montfort University",
    "Bishop Grosseteste University": "Bishop Grosseteste University",
    "University of Bradford": "University of Bradford",
    "Wrexham University": "Wrexham University",
    "Wrexham University (Single CAS)": "Wrexham University",
    "University of Roehampton": "University of Roehampton",
    "University of Roehampton (Sylhet Restricted)": "University of Roehampton",
    "University of East London (UEL)": "University of East London",
    "Cardiff Metropolitan University": "Cardiff Metropolitan University",
    "University of Huddersfield": "University of Huddersfield",
    "University of Huddersfield (Main campus)": "University of Huddersfield",
    "Ravensbourne University London": "Ravensbourne University London",
    "University of East Anglia": "University of East Anglia",
    "University of Sunderland": "University of Sunderland",
    "University of Derby": "University of Derby",
    "Abertay University": "Abertay University",
    "Bangor University": "Bangor University",
    "University of Portsmouth": "University of Portsmouth",
    "Teesside University": "Teesside University",
    "Swansea University": "Swansea University",
    "University of the West of Scotland (London Campus)": "University of the West of Scotland",
    "University of South Wales": "University of South Wales",
    "Ulster University": "Ulster University",
    "University of Bolton": "University of Bolton",
    "University of Dundee": "University of Dundee",
    "University of Bristol": "University of Bristol",
    "Sheffield Hallam University": "Sheffield Hallam University",
    "Glasgow Caledonian University": "Glasgow Caledonian University",
    "Newcastle University": "Newcastle University",
    "University of Southampton": "University of Southampton",
    "University of Surrey": "University of Surrey",
    "Keele University": "Keele University",
    "University of Aberdeen": "University of Aberdeen",
    "University of Essex": "University of Essex",
    "University of Lincoln": "University of Lincoln",  # ambiguous: sheet context is New Zealand Lincoln University
    "Walbrook Institute London": "Walbrook Institute London",
    "Coventry University": "Coventry University",
    "University of Westminster": "University of Westminster",
    "London Metropolitan University": "London Metropolitan University",
    "University of West London (UWL)": "University of West London",
    "Richmond American University London": "Richmond American University London",
    "Richmond American University London (Sylhet Restricted)": "Richmond American University London",
    "Health Science University": "Health Science University",
    "Anglia Ruskin University (Bangladesh Closed)": "Anglia Ruskin University",
    "Oxford Brookes University": "Oxford Brookes University",
    "Queen Mary University of London": "Queen Mary University of London",
    "Durham University": "Durham University",
    "Lancaster University": "Lancaster University",
    "University of Leeds": "University of Leeds",
    "Leeds Beckett University": "Leeds Beckett University",
    "Cardiff University": "Cardiff University",
    "Royal Holloway University of London": "Royal Holloway University of London",
    "University of Aberdeen": "University of Aberdeen",
    "Liverpool John Moores University (LJMU)": "Liverpool John Moores University",
}

SECTION_WORDS = re.compile(
    r"^(engineering|agriculture|business|health sciences|economics|medicine|it|computer|law|arts|"
    r"humanities|social sciences|education|science|preparatory|faculty of.*|school of.*)$", re.I)

INSTITUTION_LIKE = re.compile(
    r"(universit|college|institute|academy|school|polytechnic|TAFE|UA92|ENUIC|ICP|BPC|HIC|KUIC|"
    r"MMUIC|BCUIC|TCSU|UPIC|ICRGU|OIEG|UKIC|UBIC|QA Foundation|BPP|SAE|KOI|CIM\b|SCEI|APIC|AIIHE|"
    r"\bAIT\b|\bVIT\b|\bMIT\b|\bECU\b|\bCDU\b|QUT|ASO\b|PIHMS|NZSE|NZIS|MDS\b|NZMA|\bAIS\b|\bSIT\b|"
    r"ICL\b|ATMC|YOOBEE|TOI Ohomai|NZST|NZTC|Kaplan|Holmes|ALPHA|NDI|ICL Education|"
    r"\bUWS\b|\bUEL\b|\bUNE\b|\bUON\b|\bUSQ\b|\bUSC\b|\bUTAS\b|\bUOW\b|\bUQ\b|UNSW|\bACU\b|\bJCU\b|"
    r"\bCQU\b|\bVU\b|\bASA\b|ICHM|Sydney Met|Unitec|\bUWTSD\b|Northumbria|\bUCOL\b)", re.I)

NON_INST = re.compile(
    r"^(bachelor|master|phd|foundation|note|diploma|bachelors|masters|research|course|level\s*\d+|"
    r"ug|pg|certificate|.*?)$", re.I)


def clean(v):
    v = _fmt_cell(v)
    if v is None:
        return None
    s = str(v).replace("\u00a0", " ").strip()
    if s in ("", "*", "-", "—", "N/A", "N/A ", "N\\A", "NA", "n/a", "TBA", "TBD", "None", "none", "?", "* "):
        return None
    return re.sub(r"[ \t]+", " ", s).strip()


def norm_uni(raw):
    s = clean(raw)
    if not s:
        return None
    s = re.sub(r"\s*\((?:[^()]*)\)\s*$", "", s).strip()  # strip trailing parenthetical
    s = s.rstrip("*-– ").strip()
    s = re.sub(r"\s+", " ", s)
    return s or None


def canonical_uni(raw):
    n = norm_uni(raw)
    if not n:
        return None
    for k, v in ALIASES.items():
        kn = norm_uni(k)
        if n.lower() == kn.lower() or n.lower().startswith(kn.lower() + " "):
            return v
    return n


def parse_score(raw):
    s = clean(raw)
    if not s:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", s)
    if m:
        return {"overall": float(m.group(1)), "minimum": float(m.group(2)), "raw": s}
    return None


URL_RE = re.compile(r"https?://[^\s|,\)\"']+")

def classify_url(u):
    if "google." in u or "docs.google" in u or "drive.google" in u:
        return "INTERNAL_EVIDENCE_LINK"
    return "EXTERNAL_LINK"


def now_iso():
    return datetime.datetime.now(datetime.UTC).isoformat()


dataset = {"extracted_at": now_iso(), "source_files": [
    {"key": "product_list_bd", "file": "Product List_Bangladesh.xlsx", "role": "ALO internal product list (multi-destination, incl. programme-level sheets)"},
    {"key": "alo_bd_2026", "file": "ALO BD Entry Requirements For 2026 .xlsx", "role": "ALO internal UK entry requirements, Jan 2026 intake"},
    {"key": "australia_cheatsheet", "file": "Bangladesh - Australia University Cheatsheet.xlsx", "role": "ALO internal Australia cheatsheet (programme-level)"},
    {"key": "kampus_2027", "file": "Kampus BD Entry Requirements For 2027 Partners.xlsx", "role": "ALO internal UK entry requirements, 2027 partner sheet"},
], "institutions": {}, "programmes": [], "issues": []}

INST = dataset["institutions"]


def inst(canonical, as_written, country, file_key, sheet):
    u = INST.setdefault(canonical, {
        "canonical_name": canonical, "as_written": set(), "country": country,
        "cities": set(), "requirement_records": [], "official_urls": set(),
        "internal_links": set(), "sources": set(),
    })
    if as_written:
        u["as_written"].add(as_written)
    u["sources"].add(f"{file_key}::{sheet}")
    return u


def add_req(canonical, as_written, country, file_key, sheet, row, fields, context=None):
    if not canonical:
        return
    u = inst(canonical, as_written, country, file_key, sheet)
    rec = {"file": file_key, "sheet": sheet, "row": row, "context": context,
           "fields": {k: v for k, v in fields.items() if v},
           "verification_status": "SOURCE_CHECK_REQUIRED",
           "collected_at": now_iso(), "last_checked_at": None, "source_url": None}
    # urls from any field
    urls = []
    for v in fields.values():
        if v:
            urls += URL_RE.findall(v)
    for url in urls:
        cls = classify_url(url)
        (u["official_urls"] if cls == "EXTERNAL_LINK" else u["internal_links"]).add(url)
        if cls == "EXTERNAL_LINK" and not rec["source_url"]:
            rec["source_url"] = url
    u["requirement_records"].append(rec)


def add_prog(country, file_key, sheet, row, inst_name, level, program, duration, tuition, extra):
    if not inst_name or not program:
        return
    dataset["programmes"].append({
        "institution": inst_name, "country": country, "level": clean(level),
        "program_name": clean(program), "duration": clean(duration),
        "tuition": clean(tuition), "extra": {k: clean(v) for k, v in extra.items() if clean(v)},
        "file": file_key, "sheet": sheet, "row": row,
        "verification_status": "SOURCE_CHECK_REQUIRED", "collected_at": now_iso(),
        "source_url": None,
    })


def rows(path, sheet):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet]
    out = []
    for row in ws.iter_rows(values_only=True):
        out.append([("" if c is None else str(_fmt_cell(c)).replace("\u00a0", " ").strip()) for c in row])
    return out


def isu(v):
    return clean(v) is None


# ================= 1. Product List_Bangladesh.xlsx =================
FK = "product_list_bd"

CONTEXT_ROW = re.compile(r"\b(update|applicants|accepting|paused|restriction|please be advised|not accepting|section 2:)\b", re.I)

# --- Australia sheet ---
rws = rows(F_PRODUCT, "Australia")
hdr = rws[0]
context = None
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    sno = clean(r[0]) if len(r) else None
    if not name:
        continue
    core_inst = re.search(r"universit|college|institute|academy|school|polytechnic|TAFE", name, re.I)
    if not INSTITUTION_LIKE.search(name) or (CONTEXT_ROW.search(name) and not core_inst):
        # note/context rows (e.g. UNE Section-2 accepted BD universities list)
        context = name[:80]
        continue
    fields = {"location": r[2] if len(r) > 2 else None,
              "forms_required": r[3] if len(r) > 3 else None,
              "section_notes": r[4] if len(r) > 4 else None,
              "fees_per_year": r[5] if len(r) > 5 else None,
              "bachelor_requirement": r[6] if len(r) > 6 else None,
              "master_requirement": r[7] if len(r) > 7 else None,
              "scholarships": r[8] if len(r) > 8 else None,
              "acceptable_banks": r[9] if len(r) > 9 else None,
              "under_18": r[10] if len(r) > 10 else None,
              "processing_time": r[11] if len(r) > 11 else None,
              "remarks": r[12] if len(r) > 12 else None}
    add_req(canonical_uni(name), name, "Australia", FK, "Australia", i,
            {k: clean(v) for k, v in fields.items()}, context=context)

# --- NewZealand sheet ---
rws = rows(F_PRODUCT, "NewZealand")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"forms_required": r[2] if len(r) > 2 else None,
              "fees_per_year": r[3] if len(r) > 3 else None,
              "bachelor_requirement": r[4] if len(r) > 4 else None,
              "master_requirement": r[5] if len(r) > 5 else None,
              "scholarships": r[6] if len(r) > 6 else None,
              "acceptable_banks": r[7] if len(r) > 7 else None,
              "under_18": r[8] if len(r) > 8 else None,
              "processing_time": r[9] if len(r) > 9 else None}
    add_req(canonical_uni(name), name, "New Zealand", FK, "NewZealand", i,
            {k: clean(v) for k, v in fields.items()})

# --- UK sheet (header at index 1) ---
rws = rows(F_PRODUCT, "UK ")
for i, r in enumerate(rws[2:], start=3):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"direct_or_pathway": r[2] if len(r) > 2 else None,
              "forms_required": r[3] if len(r) > 3 else None,
              "bachelor_requirement": r[4] if len(r) > 4 else None,
              "master_requirement": r[5] if len(r) > 5 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "UK", i,
            {k: clean(v) for k, v in fields.items()})

# --- UK Updated (programme-level, forward-fill institute) ---
rws = rows(F_PRODUCT, "UK Updated")
last_inst = None
last_level = None
last_duration = None
last_tuition = None
last_total = None
for i, r in enumerate(rws[1:], start=2):
    instc = clean(r[0]) if len(r) > 0 else None
    if instc and INSTITUTION_LIKE.search(instc):
        last_inst = instc
        last_level = last_duration = last_tuition = last_total = None  # reset per institute block
    prog = clean(r[3]) if len(r) > 3 else None
    lvl = clean(r[2]) if len(r) > 2 else None
    dur = clean(r[4]) if len(r) > 4 else None
    tui = clean(r[6]) if len(r) > 6 else None
    tot = clean(r[7]) if len(r) > 7 else None
    if lvl:
        last_level = lvl
    if dur:
        last_duration = dur
    if tui:
        last_tuition = tui
    if tot:
        last_total = tot
    if last_inst and prog:
        add_prog("United Kingdom", FK, "UK Updated", i, canonical_uni(last_inst) or last_inst,
                 last_level, prog, last_duration, last_tuition,
                 {"total_tuition": last_total, "semesters": clean(r[5]) if len(r) > 5 else None,
                  "university_section": clean(r[1]) if len(r) > 1 else None,
                  "entry_notes": clean(r[8]) if len(r) > 8 else None,
                  "english_notes": clean(r[9]) if len(r) > 9 else None})

# --- Canada(Deletable) ---
rws = rows(F_PRODUCT, "Canada(Deletable)")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"city": r[2] if len(r) > 2 else None, "province": r[3] if len(r) > 3 else None,
              "school_type": r[4] if len(r) > 4 else None,
              "recruitment_regions": ",".join([clean(x) for x in r[5:8] if clean(x)]),
              "requirement_notes": r[8] if len(r) > 8 else None,
              "fees_notes": r[9] if len(r) > 9 else None}
    add_req(canonical_uni(name), name, "Canada", FK, "Canada(Deletable)", i,
            {k: clean(v) for k, v in fields.items()})

# --- Canada Updated (programme-level) ---
rws = rows(F_PRODUCT, "Canada Updated")
last_inst = None
last_level = None
for i, r in enumerate(rws[1:], start=2):
    instc = clean(r[0]) if len(r) > 0 else None
    if instc and INSTITUTION_LIKE.search(instc):
        last_inst = instc
        last_level = None
        r = r[1:] if len(r) > 1 else []
    if last_inst and len(r) > 2 and clean(r[1]):
        lvl = clean(r[0]) or last_level
        if clean(r[0]):
            last_level = clean(r[0])
        add_prog("Canada", FK, "Canada Updated", i, canonical_uni(last_inst) or last_inst,
                 lvl, r[1], r[4] if len(r) > 4 else None, r[6] if len(r) > 6 else None,
                 {"coop_status": r[2] if len(r) > 2 else None,
                  "semesters": r[5] if len(r) > 5 else None,
                  "total_tuition": r[7] if len(r) > 7 else None,
                  "intake": r[8] if len(r) > 8 else None})

# --- Malta ---
rws = rows(F_PRODUCT, "Malta")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"location": r[2] if len(r) > 2 else None,
              "fees_per_year": r[3] if len(r) > 3 else None,
              "bachelor_requirement": r[4] if len(r) > 4 else None,
              "pathway_requirement": r[5] if len(r) > 5 else None,
              "english_requirement": r[6] if len(r) > 6 else None,
              "offer_turnaround": r[7] if len(r) > 7 else None}
    add_req(canonical_uni(name), name, "Malta", FK, "Malta", i,
            {k: clean(v) for k, v in fields.items()})

# --- Hungary: summary block (rows 1-2) + programme block (from row 4) ---
rws = rows(F_PRODUCT, "Hungary")
if len(rws) > 1 and clean(rws[1][1]):
    fields = {"location": rws[1][2], "fees_per_year": rws[1][3],
              "foundation": rws[1][6] if len(rws[1]) > 6 else None,
              "bachelor_requirement": rws[1][7] if len(rws[1]) > 7 else None}
    add_req(canonical_uni(rws[1][1]), clean(rws[1][1]), "Hungary", FK, "Hungary", 2,
            {k: clean(v) for k, v in fields.items()})
last_inst = None
for i, r in enumerate(rws[4:], start=5):
    instc = clean(r[0]) if len(r) > 0 else None
    if instc and INSTITUTION_LIKE.search(instc):
        last_inst = instc
    prog = clean(r[3]) if len(r) > 3 else None
    if last_inst and prog:
        add_prog("Hungary", FK, "Hungary", i, canonical_uni(last_inst) or last_inst,
                 r[2], prog, r[4], r[6], {"total_tuition": r[7], "semesters": r[5],
                                          "university_section": r[1]})

# --- Netherland ---
rws = rows(F_PRODUCT, "Netherland")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"fees_per_year": r[2] if len(r) > 2 else None,
              "location": r[3] if len(r) > 3 else None,
              "bachelor_requirement": r[4] if len(r) > 4 else None,
              "master_requirement": r[5] if len(r) > 5 else None,
              "major_intakes": r[6] if len(r) > 6 else None}
    add_req(canonical_uni(name), name, "Netherlands", FK, "Netherland", i,
            {k: clean(v) for k, v in fields.items()})

# --- Malaysian Institutes (programme-level; institute in col0, forward-fill) ---
rws = rows(F_PRODUCT, "Malaysian Institutes")
last_inst = None
for i, r in enumerate(rws[1:], start=2):
    instc = clean(r[0]) if len(r) > 0 else None
    if instc and INSTITUTION_LIKE.search(instc):
        last_inst = instc
    course = clean(r[3]) if len(r) > 3 else None
    if last_inst and course:
        add_prog("Malaysia", FK, "Malaysian Institutes", i, canonical_uni(last_inst) or last_inst,
                 r[2], course, r[5], r[4], {"city": r[1], "english_requirement": r[6],
                                            "intake": r[7], "academic_requirement": r[8] if len(r) > 8 else None})

# ================= 2. ALO BD 2026 =================
FK = "alo_bd_2026"

def parse_uk_req_sheet(path, sheet, fk, year, region, hdr_rows):
    rws = rows(path, sheet)
    # locate header row containing 'University Name'
    hdr_i = None
    for i, r in enumerate(rws[:6]):
        if any("university name" in c.lower() for c in r if c):
            hdr_i = i
            break
    if hdr_i is None:
        return
    # merge up to 2 consecutive header rows (main header + sub-header row)
    ncol = max(len(r) for r in rws[:hdr_i + 3])
    merged = [""] * ncol
    for j in range(ncol):
        parts = []
        for k in (hdr_i, hdr_i + 1):
            if k < len(rws) and j < len(rws[k]) and clean(rws[k][j]):
                parts.append(clean(rws[k][j]))
        merged[j] = re.sub(r"\s+", " ", " ".join(parts)).strip().lower()
    headers = merged
    def has(j, label):
        return 0 <= j < ncol and label in headers[j]
    def col(label):
        for j in range(ncol):
            if headers[j].startswith(label):
                return j
        return None
    def mcol(label):
        for j in range(ncol):
            if label in headers[j]:
                return j
        return None
    c_name = mcol("university name")
    c_intake = mcol("intake")
    # data starts after header rows: first row whose name cell looks like an institution
    def looks_inst(v):
        return v and INSTITUTION_LIKE.search(v) and not SECTION_WORDS.match(v)
    data_start = hdr_i + 2
    for k in (hdr_i + 1, hdr_i + 2):
        if k < len(rws) and len(rws[k]) > (c_name or 0) and looks_inst(clean(rws[k][c_name]) if c_name is not None else None):
            data_start = k
            break
    ug_hsc = None
    for j in range(ncol):
        if headers[j].split() and "hsc" in headers[j].split():
            ug_hsc = j
            break
    def cols(label):
        return [j for j in range(ncol) if label in headers[j].split()]
    ielts_c = cols("ielts"); oietc_c = cols("oietc"); pte_c = cols("pte")
    duo_c = cols("duolingo"); kap_c = cols("kaplan"); gap_c = cols("gap")
    hon_c = cols("honors")
    def pick(lst, which):
        if not lst:
            return None
        return lst[0] if which == "ug" else (lst[1] if len(lst) > 1 else None)
    c_dep = mcol("initial deposit"); c_interv = mcol("interview")
    c_ci = mcol("ci method"); c_casreq = mcol("cas request"); c_casdep = mcol("cas deposit")
    c_tui = mcol("tuition fees"); c_sch = mcol("max. scholarship"); c_rem = mcol("remarks")
    c_esrc = mcol("english requirements source")
    c_rsrc = mcol("entry requirements source")
    def val(r, idx):
        if idx is None or idx >= len(r):
            return None
        return r[idx]

    for i, r in enumerate(rws[data_start:], start=data_start + 1):
        name = clean(val(r, c_name))
        if not name or not INSTITUTION_LIKE.search(name):
            continue
        fields = {
            "intake": val(r, c_intake),
            "ug_hsc": val(r, ug_hsc),
            "ug_ielts": val(r, pick(ielts_c, "ug")),
            "ug_oietc": val(r, pick(oietc_c, "ug")),
            "ug_pte": val(r, pick(pte_c, "ug")),
            "ug_duolingo": val(r, pick(duo_c, "ug")),
            "ug_year_gap": val(r, pick(gap_c, "ug")),
            "pg_honors": val(r, pick(hon_c, "pg")),
            "pg_ielts": val(r, pick(ielts_c, "pg")),
            "pg_oietc": val(r, pick(oietc_c, "pg")),
            "pg_pte": val(r, pick(pte_c, "pg")),
            "pg_duolingo": val(r, pick(duo_c, "pg")),
            "pg_year_gap": val(r, pick(gap_c, "pg")),
            "initial_deposit": val(r, c_dep),
            "interview_timing": val(r, c_interv),
            "ci_method": val(r, c_ci),
            "cas_request": val(r, c_casreq),
            "cas_deposit": val(r, c_casdep),
            "tuition_fees": val(r, c_tui),
            "max_scholarship": val(r, c_sch),
            "remarks": val(r, c_rem),
            "english_source_ref": val(r, c_esrc),
            "entry_source_ref": val(r, c_rsrc),
        }
        add_req(canonical_uni(name), name, "United Kingdom", fk, sheet, i,
                {k: clean(v) for k, v in fields.items()},
                context=f"UK {region} {year}")

parse_uk_req_sheet(F_ALO26, "Bangladesh 2026", FK, 2026, "Bangladesh", 2)
parse_uk_req_sheet(F_ALO26, "Sylhet 2026", FK, 2026, "Sylhet", 2)

# MOI sheet
rws = rows(F_ALO26, "MOI")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "pg_honors": r[3] if len(r) > 3 else None,
              "moi_remarks": r[4] if len(r) > 4 else None, "year_gap": r[5] if len(r) > 5 else None,
              "moi_note": r[6] if len(r) > 6 else None, "tuition_fees": r[7] if len(r) > 7 else None,
              "moi_side_note": r[8] if len(r) > 8 else None, "listed_universities": r[9] if len(r) > 9 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "MOI", i,
            {k: clean(v) for k, v in fields.items()}, context="UK MOI (Medium of Instruction) policy 2026")

# DBAPHD MRES
rws = rows(F_ALO26, "DBAPHD MRES")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "program_name": r[3] if len(r) > 3 else None,
              "honors_requirement": r[4] if len(r) > 4 else None,
              "english_proficiency": r[5] if len(r) > 5 else None,
              "year_gap": r[6] if len(r) > 6 else None, "remarks": r[7] if len(r) > 7 else None,
              "tuition_fees": r[8] if len(r) > 8 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "DBAPHD MRES", i,
            {k: clean(v) for k, v in fields.items()}, context="UK DBA / MSc Research / MRes 2025-26")

# Foundation
rws = rows(F_ALO26, "Foundation")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "hsc": r[3] if len(r) > 3 else None,
              "ielts": r[4] if len(r) > 4 else None, "fees": r[5] if len(r) > 5 else None,
              "year_gap": r[6] if len(r) > 6 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "Foundation", i,
            {k: clean(v) for k, v in fields.items()}, context="UK International Foundation 2026")

# English Proficiency Alternate
rws = rows(F_ALO26, "English Proficiency Alternate")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[2]) if len(r) > 2 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"oietc": r[3] if len(r) > 3 else None, "duolingo": r[4] if len(r) > 4 else None,
              "toefl": r[5] if len(r) > 5 else None, "internal_test": r[6] if len(r) > 6 else None,
              "pte": r[7] if len(r) > 7 else None, "moi": r[8] if len(r) > 8 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "English Proficiency Alternate", i,
            {k: clean(v) for k, v in fields.items()}, context="UK alternative English proficiency")

# Deadline (mostly empty — record the gap)
rws = rows(F_ALO26, "Deadline")
deadline_rows = 0
deadline_filled = 0
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    deadline_rows += 1
    filled = [clean(x) for x in r[3:15] if clean(x)]
    deadline_filled += len(filled)
    fields = {"intake": r[2] if len(r) > 2 else None,
              "ug_deadlines": " | ".join([clean(x) for x in r[4:9] if clean(x)]) or None,
              "pg_deadlines": " | ".join([clean(x) for x in r[10:15] if clean(x)]) or None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "Deadline", i,
            {k: clean(v) for k, v in fields.items()}, context="UK deadlines 2026")
dataset["issues"].append({
    "type": "MISSING_DATA_GAP", "scope": "alo_bd_2026::Deadline + kampus_2027::Deadline",
    "detail": f"{deadline_rows} university deadline rows exist but {deadline_filled} deadline cells are filled — application/condition/deposit/CAS/enrolment deadlines are not maintained in the sheets.",
})

# ================= 3. Australia cheatsheet =================
FK = "australia_cheatsheet"
rws = rows(F_CHEAT, "Sheet1")
last_inst = None
for i, r in enumerate(rws[1:], start=2):
    instc = clean(r[1]) if len(r) > 1 else None
    if instc:
        last_inst = instc
    if not last_inst:
        continue
    level = clean(r[4]) if len(r) > 4 else None
    english = clean(r[5]) if len(r) > 5 else None
    if level or english:
        add_prog("Australia", FK, "Sheet1", i, canonical_uni(last_inst) or last_inst,
                 level, level or english, None, clean(r[6]) if len(r) > 6 else None,
                 {"english_requirements": english,
                  "scholarship": clean(r[7]) if len(r) > 7 else None,
                  "intake": clean(r[3]) if len(r) > 3 else None,
                  "city": clean(r[2]) if len(r) > 2 else None,
                  "turnaround": clean(r[8]) if len(r) > 8 else None,
                  "remark": clean(r[9]) if len(r) > 9 else None})

# ================= 4. Kampus 2027 =================
FK = "kampus_2027"
parse_uk_req_sheet(F_KAMPUS, "Bangladesh 2027", FK, 2027, "Bangladesh", 3)
parse_uk_req_sheet(F_KAMPUS, "Sylhet 2027", FK, 2027, "Sylhet", 3)

# UK-I sheet
rws = rows(F_KAMPUS, "UK-I")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "course_name": r[3] if len(r) > 3 else None,
              "last_academic_accepted": r[4] if len(r) > 4 else None,
              "interview": r[5] if len(r) > 5 else None, "requirements": r[6] if len(r) > 6 else None,
              "tuition_fees": r[7] if len(r) > 7 else None, "contract_region": r[8] if len(r) > 8 else None,
              "offer_tat": r[9] if len(r) > 9 else None, "remarks": r[10] if len(r) > 10 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "UK-I", i,
            {k: clean(v) for k, v in fields.items()}, context="UK-I applicant route 2027")

# MOI
rws = rows(F_KAMPUS, "MOI")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "pg_honors": r[3] if len(r) > 3 else None,
              "moi_remarks": r[4] if len(r) > 4 else None, "year_gap": r[5] if len(r) > 5 else None,
              "moi_note": r[6] if len(r) > 6 else None, "tuition_fees": r[7] if len(r) > 7 else None,
              "moi_side_note": r[8] if len(r) > 8 else None, "listed_universities": r[9] if len(r) > 9 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "MOI", i,
            {k: clean(v) for k, v in fields.items()}, context="UK MOI policy 2027")

# Foundation
rws = rows(F_KAMPUS, "Foundation")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None, "requirement_link": r[3] if len(r) > 3 else None,
              "hsc": r[4] if len(r) > 4 else None, "ielts": r[5] if len(r) > 5 else None,
              "fees": r[6] if len(r) > 6 else None, "year_gap": r[7] if len(r) > 7 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "Foundation", i,
            {k: clean(v) for k, v in fields.items()}, context="UK International Foundation 2027")

# English Proficiency Alternate
rws = rows(F_KAMPUS, "English Proficiency Alternate")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[2]) if len(r) > 2 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"ellt": r[3] if len(r) > 3 else None, "duolingo": r[4] if len(r) > 4 else None,
              "toefl": r[5] if len(r) > 5 else None, "internal_test": r[6] if len(r) > 6 else None,
              "pte": r[7] if len(r) > 7 else None, "moi": r[8] if len(r) > 8 else None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "English Proficiency Alternate", i,
            {k: clean(v) for k, v in fields.items()}, context="UK alternative English proficiency 2027")

# Deadline
rws = rows(F_KAMPUS, "Deadline")
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[1]) if len(r) > 1 else None
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"intake": r[2] if len(r) > 2 else None,
              "ug_deadlines": " | ".join([clean(x) for x in r[4:9] if clean(x)]) or None,
              "pg_deadlines": " | ".join([clean(x) for x in r[10:15] if clean(x)]) or None}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "Deadline", i,
            {k: clean(v) for k, v in fields.items()}, context="UK deadlines 2027")

# Restricted Universities
rws = rows(F_KAMPUS, "Restricted Universities")
paused = False
for i, r in enumerate(rws[1:], start=2):
    name = clean(r[0]) if len(r) > 0 else None
    if not name:
        continue
    if "paused" in name.lower():
        paused = True
        continue
    if paused:
        name = name.lstrip("* ").strip()
    if not name or not INSTITUTION_LIKE.search(name):
        continue
    fields = {"program_scope": r[1] if len(r) > 1 else None,
              "restriction_zone": r[2] if len(r) > 2 else None,
              "restriction_notes": r[3] if len(r) > 3 else None,
              "status": "PAUSED_FROM_BANGLADESH" if paused else "ZONE_RESTRICTED"}
    add_req(canonical_uni(name), name, "United Kingdom", FK, "Restricted Universities", i,
            {k: clean(v) for k, v in fields.items()}, context="UK recruitment restrictions")

# ================= finalize institutions =================
for u in INST.values():
    u["as_written"] = sorted(u["as_written"])
    u["cities"] = sorted(u["cities"])
    u["official_urls"] = sorted(u["official_urls"])
    u["internal_links"] = sorted(u["internal_links"])
    u["sources"] = sorted(u["sources"])
    u["record_count"] = len(u["requirement_records"])

# city extraction from requirement records (location/city fields)
for u in INST.values():
    u["cities"] = set(u["cities"])
    for rec in u["requirement_records"]:
        for key in ("location", "city"):
            v = rec["fields"].get(key)
            if v and len(v) < 120 and not URL_RE.search(v):
                u["cities"].add(v)
    u["cities"] = sorted(u["cities"])[:12]

# ================= issues =================
# conflicts within same file+sheet-family
def sheet_family(sheet):
    s = sheet.lower()
    if "2026" in s:
        return "2026"
    if "2027" in s:
        return "2027"
    if "uk-i" in s:
        return "uk-i"
    return sheet

CONFLICT_FIELDS = ["tuition_fees", "initial_deposit", "cas_deposit", "pg_ielts", "ug_ielts",
                   "max_scholarship", "pg_honors", "ug_hsc"]
for cname, u in INST.items():
    seen = {}
    for rec in u["requirement_records"]:
        for f in CONFLICT_FIELDS:
            v = rec["fields"].get(f)
            if not v:
                continue
            fam = sheet_family(rec["sheet"])
            sig = re.sub(r"[\s£,]", "", v.lower())
            key = (f, fam)
            seen.setdefault(key, {}).setdefault(sig, {"value": v, "locations": []})["locations"].append(
                f"{rec['file']}::{rec['sheet']}:row{rec['row']}")
    for (f, fam), variants in seen.items():
        if len(variants) > 1:
            dataset["issues"].append({
                "type": "CONFLICTING_INFORMATION", "university": cname,
                "field": f, "sheet_family": fam,
                "variants": [{"value": v["value"], "locations": v["locations"]} for v in variants.values()],
            })

# ambiguous names (Lincoln)
dataset["issues"].append({
    "type": "AMBIGUOUS_INSTITUTION_NAME", "university": "University of Lincoln",
    "detail": "'University of Lincoln' appears in product_list_bd::NewZealand — this is Lincoln University, New Zealand (as written in the sheet), not the UK priority university #20. Records are preserved separately; country tagging disambiguates.",
})
# fix Lincoln country
if "University of Lincoln" in INST:
    INST["University of Lincoln"]["country"] = "New Zealand (as written; ambiguous with UK University of Lincoln)"
    for rec in INST["University of Lincoln"]["requirement_records"]:
        rec["fields"]["name_ambiguity_note"] = "Sheet context is NewZealand — likely Lincoln University (NZ), NOT UK University of Lincoln"

# priority 27 coverage (exact canonical only)
coverage = []
for name in PRIORITY_27:
    hit = INST.get(name)
    ambiguous = bool(hit and "New Zealand" in hit["country"])
    coverage.append({
        "university": name,
        "present_in_existing_data": bool(hit and hit["record_count"] > 0 and not ambiguous),
        "ambiguous_namesake_note": ("Records found under this name are the New Zealand institution (as written in the sheets), not the UK priority university." if ambiguous else None),
        "record_count": hit["record_count"] if (hit and not ambiguous) else 0,
        "sheets": hit["sources"] if (hit and not ambiguous) else [],
        "official_urls_found": hit["official_urls"] if (hit and not ambiguous) else [],
    })
dataset["priority27_coverage"] = coverage

dataset["summary"] = {
    "unique_institutions": len(INST),
    "total_requirement_records": sum(u["record_count"] for u in INST.values()),
    "total_programme_records": len(dataset["programmes"]),
    "conflicting_information": sum(1 for i in dataset["issues"] if i["type"] == "CONFLICTING_INFORMATION"),
    "priority27_with_existing_data": sum(1 for c in coverage if c["present_in_existing_data"]),
    "countries": sorted(set(u["country"].split(" (")[0] for u in INST.values())),
    "official_urls_found": sum(len(u["official_urls"]) for u in INST.values()),
}

with open(os.path.join(OUTDIR, "alo_dataset.json"), "w", encoding="utf-8") as fh:
    json.dump(dataset, fh, indent=1, ensure_ascii=False)

s = dataset["summary"]
print(json.dumps(s, indent=2))
print("\nPRIORITY 27 COVERAGE (exact match):")
for c in coverage:
    print(f"  {'YES' if c['present_in_existing_data'] else 'NO ':3} {c['university']:45} records={c['record_count']}")
print(f"\nIssues: {len(dataset['issues'])} total")
print(f"Saved -> {OUTDIR}/alo_dataset.json")
