#!/usr/bin/env python3
"""Verify wave-2 operator-supplied repos via GitHub API (authenticated)."""
import json, os, urllib.request, urllib.error, sys

TOKEN = open(os.path.expanduser("/home/z/my-project/.secrets/ghtoken")).read().strip()
HDR = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
       "User-Agent": "alo-wave2-verifier"}

REPOS = [
    "caprover/caprover",
    "dokku/dokku",
    "GrapesJS/grapesjs",
    "SWE-agent/SWE-agent",
    "amulchapla/AI-Powered-Call-Center-Intelligence",
    "twilio-labs/call-gpt",
    "perrypixel/10x-Tool-Calls",
    "rasonyang/ai-native-callcenter",
    "MeiGen-AI/InfiniteTalk",
    "cheaper-inference/OmniCopilot",
    "Alishahryar1/free-claude-code",
    "meta/astryx",
    "DistinctZA/patina",
    "milind-soni/OpenMausBot",
    "Immortal-Protocols/lastbook",
    "NYLLON-SOFTWARE/SignuDoc",
    "monid-ai/monid",
]

def api(url):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r), r.status
    except urllib.error.HTTPError as e:
        return {"_error": e.code}, e.code

print(f"{'repo':<45}{'stars':>8} {'license':<14}{'lang':<12}{'pushed':<12}{'arch':<6}status")
for full in REPOS:
    d, st = api(f"https://api.github.com/repos/{full}")
    if st != 200:
        print(f"{full:<45}{'-':>8} {'-':<14}{'-':<12}{'-':<12}{'-':<6}HTTP {st}")
        continue
    lic = (d.get("license") or {}).get("spdx_id") or "NOASSERTION"
    print(f"{d['full_name']:<45}{d['stargazers_count']:>8} {lic:<14}{str(d.get('language'))[:11]:<12}{d['pushed_at'][:10]:<12}{str(d['archived']):<6}OK")

# rasonyang profile: list public repos
print("\n== /users/rasonyang/repos ==")
d, st = api("https://api.github.com/users/rasonyang/repos?per_page=30&sort=updated")
if st == 200:
    for r in d:
        lic = (r.get("license") or {}).get("spdx_id") or "NOASSERTION"
        print(f"{r['full_name']:<45}{r['stargazers_count']:>8} {lic:<14}{str(r.get('language'))[:11]:<12}{r['pushed_at'][:10]}")
else:
    print("HTTP", st)

# topic jarvis-ai: top 15 by stars
print("\n== topic:jarvis-ai (top 15 by stars) ==")
d, st = api("https://api.github.com/search/repositories?q=topic:jarvis-ai&sort=stars&order=desc&per_page=15")
if st == 200:
    print("total:", d.get("total_count"))
    for r in d.get("items", []):
        lic = (r.get("license") or {}).get("spdx_id") or "NOASSERTION"
        print(f"{r['full_name']:<45}{r['stargazers_count']:>8} {lic:<14}{str(r.get('language'))[:11]:<12}{r['pushed_at'][:10]}")
else:
    print("HTTP", st)
