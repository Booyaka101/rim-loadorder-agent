"""Build a Sanity NDJSON import from a local RimWorld install.

Reads every mod's About/About.xml (installed mods and the SteamCMD workshop cache),
the active load order from ModsConfig.xml, RimSort's community rules and the
hand-written incidents, and writes one document per line:

    python build.py > ../data/production.ndjson
    npx sanity dataset import ../data/production.ndjson production --replace
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.environ.get("RIMWORLD_DIR", r"D:\SteamLibrary\steamapps\common\RimWorld")
WORKSHOP = os.environ.get("WORKSHOP_DIR", r"C:\tmp\steamcmd\steamapps\workshop\content\294100")
CONFIG = os.path.expandvars(r"%USERPROFILE%\AppData\LocalLow\Ludeon Studios\RimWorld by Ludeon Studios")
ACTIVE_LIST = os.environ.get("MODS_CONFIG", os.path.join(CONFIG, "Config", "ModsConfig_FULL237_BACKUP_2026-06-29.xml"))
OLD_LIST = os.path.join(CONFIG, "ModLists", "new begining.rml")
RULES = os.environ.get("COMMUNITY_RULES", r"C:\tmp\rimdata\communityRules.json")
GAME_VERSION = "1.6"

OFFICIAL = {
    "ludeon.rimworld": "Core",
    "ludeon.rimworld.royalty": "Royalty",
    "ludeon.rimworld.ideology": "Ideology",
    "ludeon.rimworld.biotech": "Biotech",
    "ludeon.rimworld.anomaly": "Anomaly",
    "ludeon.rimworld.odyssey": "Odyssey",
}

# Mods switched off while getting the 1.6 list to load clean (see incidents.json).
DISABLED = {
    "zsbk.patch16.whileyoureup": "Harmony patches fail on 1.6; Pick Up And Haul covers it",
    "sarg.smartspeed": "Harmony patches fail on 1.6; built-in speed controls cover it",
    "arandomkiwi.huntforme": "Illegal defName on 1.6; Colony Manager covers auto-hunting",
    "ray1203.simplecamerasetting": "Conflicts with Camera+",
    "owlchemist.giddyup": "Duplicate fork of Giddy-Up 2 Continued",
    "sihv.rombones": "BoneWall def errors and failed patches",
    "anomalypatch.1trickpwnyta": "Patch targets a def that moved",
    "xandrmoro.rim.lovinismessy": "Failed patch, minor mod",
    "ferny.coloredcategories": "Failed patch, minor mod",
}

RICH_TEXT = re.compile(r"</?(?:color|b|i|size|material|quad)[^>]*>", re.I)


def doc_id(package_id):
    # Dots in _id put a document on a non-root path, which a public dataset hides.
    return "mod-" + re.sub(r"[^a-z0-9_-]", "-", package_id)


def texts(node, tag):
    el = node.find(tag)
    return [li.text.strip() for li in el.findall("li") if li.text and li.text.strip()] if el is not None else []


def by_version(node, tag):
    """Entries for the current game version from a <fooByVersion><v1.6>... block."""
    el = node.find(tag + "ByVersion")
    if el is None:
        return []
    ver = el.find("v" + GAME_VERSION)
    return [li for li in ver.findall("li")] if ver is not None else []


def workshop_id_from(url):
    m = re.search(r"(\d{6,})", url or "")
    return m.group(1) if m else None


def parse_about(path, workshop_id):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8-sig", errors="replace")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        # A few authors ship bare ampersands; escape those and retry.
        root = ET.fromstring(re.sub(r"&(?!\w+;|#\d+;)", "&amp;", raw))
    package_id = (root.findtext("packageId") or "").strip().lower()
    if not package_id:
        return None

    def links(tag):
        out = []
        for pid in texts(root, tag) + [li.text.strip() for li in by_version(root, tag) if li.text]:
            out.append({"packageId": pid.lower()})
        return out

    deps = []
    deps_el = root.find("modDependencies")
    for li in (list(deps_el) if deps_el is not None else []) + by_version(root, "modDependencies"):
        pid = (li.findtext("packageId") or "").strip().lower()
        if pid:
            deps.append({"packageId": pid, "displayName": (li.findtext("displayName") or "").strip() or None,
                         "workshopId": workshop_id_from(li.findtext("steamWorkshopUrl"))})

    authors = texts(root, "authors") or [a.strip() for a in (root.findtext("author") or "").split(",") if a.strip()]
    return {
        "_id": doc_id(package_id),
        "_type": "mod",
        "title": (root.findtext("name") or package_id).strip(),
        "packageId": package_id,
        "workshopId": workshop_id,
        "authors": authors,
        "supportedVersions": texts(root, "supportedVersions"),
        "dependencies": deps,
        "loadAfter": links("loadAfter") + links("forceLoadAfter"),
        "loadBefore": links("loadBefore") + links("forceLoadBefore"),
        "incompatibleWith": links("incompatibleWith"),
        "description": RICH_TEXT.sub("", (root.findtext("description") or "")).strip(),
        "url": (root.findtext("url") or "").strip() or None,
    }


def load_mods():
    mods = {}
    for base in (WORKSHOP, os.path.join(GAME, "Mods")):  # installed copy wins
        for wid in sorted(os.listdir(base)):
            about = os.path.join(base, wid, "About", "About.xml")
            if os.path.isfile(about):
                mod = parse_about(about, wid if wid.isdigit() else None)
                if mod:
                    mods[mod["packageId"]] = mod
    for pid, name in OFFICIAL.items():
        mods[pid] = {"_id": doc_id(pid), "_type": "mod", "title": name, "packageId": pid,
                     "authors": ["Ludeon Studios"], "supportedVersions": [GAME_VERSION], "kind": "official",
                     "dependencies": [] if pid == "ludeon.rimworld" else [{"packageId": "ludeon.rimworld"}],
                     "loadAfter": [] if pid == "ludeon.rimworld" else [{"packageId": "ludeon.rimworld"}],
                     "loadBefore": [], "incompatibleWith": []}
    return mods


def link(mods, pid, key=None, **extra):
    """A modLink; pass key when it goes in an array."""
    pid = pid.lower()
    out = {"_key": key} if key else {}
    out.update({"_type": "modLink", "packageId": pid})
    if pid in mods:
        out["mod"] = {"_type": "reference", "_ref": mods[pid]["_id"], "_weak": True}
    out.update({k: v for k, v in extra.items() if v})
    return out


def resolve_links(mods):
    dependents = Counter(d["packageId"] for m in mods.values() for d in m["dependencies"])
    for m in mods.values():
        for field in ("dependencies", "loadAfter", "loadBefore", "incompatibleWith"):
            seen, out = set(), []
            for i, entry in enumerate(m[field]):
                if entry["packageId"] in seen:
                    continue
                seen.add(entry["packageId"])
                out.append(link(mods, entry["packageId"], key=f"{field[:3]}{i}", displayName=entry.get("displayName")))
            m[field] = out
        m.setdefault("kind", "framework" if dependents[m["packageId"]] >= 2 else "content")


def supersede(mods, active):
    """Point each mod that doesn't declare 1.6 at an active 1.6 mod with the same base name."""
    def base(title):
        t = re.sub(r"\[[^\]]*\]|\([^)]*\)|continued|unofficial|legacy|fork(ed)?|\d(\.\d)?", "", title.lower())
        return re.sub(r"[^a-z]+", " ", t).strip()
    by_base = {}
    for pid in active:
        if pid in mods and GAME_VERSION in mods[pid]["supportedVersions"]:
            by_base.setdefault(base(mods[pid]["title"]), pid)
    for m in mods.values():
        if GAME_VERSION not in m["supportedVersions"]:
            target = by_base.get(base(m["title"]))
            if target and target != m["packageId"]:
                m["supersededBy"] = {"_type": "reference", "_ref": mods[target]["_id"], "_weak": True}


def read_list(path, tag):
    root = ET.parse(path).getroot()
    el = root.find(tag)
    return [li.text.strip().lower() for li in el.findall("li")]


def mod_lists(mods, active):
    current = {
        "_id": "modlist-current", "_type": "modList", "title": "Owner's RimWorld 1.6 list",
        "gameVersion": GAME_VERSION,
        "entries": [link(mods, pid, key=f"e{i}") for i, pid in enumerate(active)],
        "disabled": [{"_key": f"d{i}", "mod": link(mods, pid, key=f"m{i}"), "reason": reason}
                     for i, (pid, reason) in enumerate(DISABLED.items())],
    }
    old = read_list(OLD_LIST, "modList/ids")
    names = [li.text for li in ET.parse(OLD_LIST).getroot().find("modList/names").findall("li")]
    previous = {
        "_id": "modlist-previous-15", "_type": "modList", "title": "Owner's list from 1.5, before the 1.6 update",
        "gameVersion": "1.5",
        "entries": [link(mods, pid, key=f"e{i}", displayName=name) for i, (pid, name) in enumerate(zip(old, names))],
    }
    return [current, previous]


def as_list(value):
    return [v for v in (value if isinstance(value, list) else [value]) if v]


def community_rules(mods):
    with open(RULES, encoding="utf-8") as f:
        rules = json.load(f)["rules"]
    out = []
    for subject, body in rules.items():
        subject = subject.lower()
        if subject not in mods:
            continue
        for relation in ("loadAfter", "loadBefore", "incompatibleWith"):
            for target, meta in (body.get(relation) or {}).items():
                meta = meta if isinstance(meta, dict) else {}
                note = "; ".join(as_list(meta.get("comment")))
                name = next(iter(as_list(meta.get("name"))), None)
                out.append({
                    "_id": f"rule-{doc_id(subject)[4:]}-{relation}-{doc_id(target.lower())[4:]}"[:120],
                    "_type": "rule", "subject": link(mods, subject), "relation": relation,
                    "target": link(mods, target, displayName=name), "source": "rimsort-community",
                    **({"note": note} if note else {}),
                })
        for relation in ("loadTop", "loadBottom"):
            if (body.get(relation) or {}).get("value"):
                out.append({"_id": f"rule-{doc_id(subject)[4:]}-{relation}", "_type": "rule",
                            "subject": link(mods, subject), "relation": relation, "source": "rimsort-community"})
    return out


def incidents(mods):
    with open(os.path.join(HERE, "incidents.json"), encoding="utf-8") as f:
        items = json.load(f)
    for item in items:
        item["_type"] = "incident"
        item["mods"] = [link(mods, pid, key=f"m{i}") for i, pid in enumerate(item["mods"])]
        if not item.get("signature"):
            item.pop("signature", None)
    return items


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    mods = load_mods()
    active = read_list(ACTIVE_LIST, "activeMods")
    resolve_links(mods)
    supersede(mods, active)
    docs = list(mods.values()) + mod_lists(mods, active) + community_rules(mods) + incidents(mods)
    for d in docs:
        sys.stdout.write(json.dumps({k: v for k, v in d.items() if v not in (None, [])}, ensure_ascii=False) + "\n")
    missing = sorted({pid for pid in active if pid not in mods} | set(DISABLED) - set(mods))
    print(f"{len(mods)} mods, {len(docs)} docs; unresolved: {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
