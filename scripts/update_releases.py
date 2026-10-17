#!/usr/bin/env python3
"""从 GitHub API 拉取各项目最新 Release，生成 data/releases.json。

本地运行：gh 已登录时直接 `python3 scripts/update_releases.py`（无 token 亦可用匿名额度）。
CI 运行：环境变量 GITHUB_TOKEN / GH_TOKEN 会被自动使用。

排除资产：.blockmap、latest*.yml（自动更新元数据，不用于手动下载）。
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS = os.path.join(ROOT, "data", "projects.json")
OUT = os.path.join(ROOT, "data", "releases.json")
EXCLUDE = re.compile(r"\.blockmap$|^latest.*\.ya?ml$|-update\.zip$", re.IGNORECASE)
API = "https://api.github.com/repos"


def token():
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    # 本地兜底：gh CLI
    try:
        r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return None


def fetch_json(url, tok):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "sirkayzh.github.io-release-sync",
    })
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    # 本机可能有系统代理导致 127.0.0.1 之外的请求异常，GitHub API 走默认网络
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def main():
    with open(PROJECTS, encoding="utf-8") as f:
        projects = json.load(f)["projects"]
    tok = token()
    releases = {}
    for p in projects:
        repo = p["repo"]
        entry = None
        try:
            data = fetch_json(f"{API}/{repo}/releases/latest", tok)
            entry = {
                "tag": data.get("tag_name"),
                "name": data.get("name") or data.get("tag_name"),
                "published_at": data.get("published_at"),
                "notes_md": data.get("body") or "",
                "html_url": data.get("html_url"),
                "assets": [
                    {
                        "name": a["name"],
                        "size": a["size"],
                        "download_count": a["download_count"],
                        "url": a["browser_download_url"],
                    }
                    for a in data.get("assets", [])
                    if not EXCLUDE.search(a["name"])
                ],
            }
            print(f"  ok   {repo} -> {entry['tag']} ({len(entry['assets'])} assets)")
        except Exception as e:  # 私有仓库 / 无 release：置 null，页面显示「即将开源」
            print(f"  skip {repo}: {e}")
        releases[p["slug"]] = entry

    doc = {"updated_at": datetime.now(timezone.utc).isoformat(), "releases": releases}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"written {OUT}")


if __name__ == "__main__":
    sys.exit(main())
