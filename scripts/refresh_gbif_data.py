"""
Refresh the GBIF occurrence dataset that backs the dashboard.

What it does:
  1. Submits an occurrence-download request to GBIF for class Insecta in
     Indiana with occurrenceStatus=present (TAXON_KEY 216).
  2. Polls GBIF every 10 minutes until the download is ready (or fails).
  3. Downloads the resulting zip and extracts the TSV to ./data/IN_data.txt
     (atomic replace).
  4. Updates lib/citation.ts with the new DOI and download date.

Credentials:
  Reads GBIF_USER and GBIF_PASSWORD from a .env file at the project root,
  or from the process environment. The .env file is gitignored.

Next steps after this script finishes:
  npm run build:data   # regenerate /public/data/
  git add data/IN_data.txt public/data/ lib/citation.ts
  git commit -m "Update GBIF data to <new DOI>"
  git push             # auto-redeploys on Vercel

Usage:
  python3 scripts/refresh_gbif_data.py            # full run, 10-min polling
  python3 scripts/refresh_gbif_data.py --resume KEY  # rejoin an in-progress download
  python3 scripts/refresh_gbif_data.py --poll-seconds 120  # faster polling
  python3 scripts/refresh_gbif_data.py --dry-run  # build the predicate, don't submit

GBIF API reference:
  https://techdocs.gbif.org/en/data-use/api-downloads
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TARGET_FILE = DATA_DIR / "IN_data.txt"
CITATION_FILE = ROOT / "lib" / "citation.ts"

API_BASE = "https://api.gbif.org/v1/occurrence/download"

# GBIF backbone taxon key for class Insecta
INSECTA_TAXON_KEY = "216"

# Terminal states from the GBIF download status enum
TERMINAL_FAIL_STATES = {"CANCELLED", "FAILED", "FILE_ERASED", "KILLED", "SUSPENDED"}
TERMINAL_OK_STATE = "SUCCEEDED"


# ---------- env loading -----------------------------------------------------

def load_dotenv() -> None:
    """Populate os.environ from a project-root .env file (does not override
    values already in the environment)."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


# ---------- predicate construction -----------------------------------------

def build_predicate(creator: str, notify_email: str | None) -> dict:
    notify_addresses = [notify_email] if notify_email else []
    return {
        "creator": creator,
        "notificationAddresses": notify_addresses,
        "sendNotification": bool(notify_addresses),
        "format": "SIMPLE_CSV",
        "predicate": {
            "type": "and",
            "predicates": [
                {"type": "equals", "key": "COUNTRY", "value": "US"},
                {"type": "equals", "key": "STATE_PROVINCE", "value": "Indiana"},
                {"type": "equals", "key": "TAXON_KEY", "value": INSECTA_TAXON_KEY},
                {"type": "equals", "key": "OCCURRENCE_STATUS", "value": "present"},
            ],
        },
    }


# ---------- HTTP helpers ----------------------------------------------------

def basic_auth_header(user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return f"Basic {token}"


def submit_download(predicate: dict, user: str, password: str) -> str:
    """POST the predicate; returns the GBIF download key."""
    req = urllib.request.Request(
        f"{API_BASE}/request",
        data=json.dumps(predicate).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": basic_auth_header(user, password),
            "User-Agent": "INDD-Dashboard-Refresh/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode().strip()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sys.exit("GBIF authentication failed (401). Check GBIF_USER / GBIF_PASSWORD.")
        body = e.read().decode(errors="replace")
        sys.exit(f"GBIF returned HTTP {e.code} on submit: {body}")


def get_status(key: str) -> dict:
    req = urllib.request.Request(
        f"{API_BASE}/{key}",
        headers={"Accept": "application/json", "User-Agent": "INDD-Dashboard-Refresh/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def download_zip(key: str, dest: Path) -> None:
    url = f"{API_BASE}/request/{key}.zip"
    req = urllib.request.Request(
        url, headers={"User-Agent": "INDD-Dashboard-Refresh/1.0"}
    )
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as f:
        shutil.copyfileobj(resp, f, length=1024 * 1024)
    tmp.rename(dest)


# ---------- citation update -------------------------------------------------

def update_citation(doi: str, download_date: str) -> None:
    if not CITATION_FILE.exists():
        print(f"warning: {CITATION_FILE} not found; skipping citation update.")
        return
    content = CITATION_FILE.read_text()
    new = content
    new = re.sub(
        r'export const GBIF_DOI_URL = "[^"]*";',
        f'export const GBIF_DOI_URL = "https://doi.org/{doi}";',
        new,
    )
    new = re.sub(
        r'export const GBIF_DOI = "[^"]*";',
        f'export const GBIF_DOI = "{doi}";',
        new,
    )
    new = re.sub(
        r'export const GBIF_DOWNLOAD_DATE = "[^"]*";',
        f'export const GBIF_DOWNLOAD_DATE = "{download_date}";',
        new,
    )
    if new == content:
        print(
            f"warning: no GBIF_* constants matched in {CITATION_FILE} — "
            "edit it by hand."
        )
        return
    CITATION_FILE.write_text(new)
    print(f"Updated {CITATION_FILE.relative_to(ROOT)} (DOI={doi}, date={download_date}).")


# ---------- main ------------------------------------------------------------

def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument(
        "--poll-seconds",
        type=int,
        default=600,
        help="Seconds between status polls (default: 600 = 10 minutes).",
    )
    p.add_argument(
        "--resume",
        metavar="KEY",
        help="Skip submission; poll an existing download key (e.g. after a crash).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the predicate that would be submitted, then exit.",
    )
    p.add_argument(
        "--max-poll-hours",
        type=float,
        default=24.0,
        help="Give up after this many hours of polling (default: 24).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    load_dotenv()

    user = os.environ.get("GBIF_USER", "").strip()
    password = os.environ.get("GBIF_PASSWORD", "").strip()
    notify = os.environ.get("GBIF_NOTIFY_EMAIL", "").strip() or None

    if not user or not password:
        sys.exit(
            "Set GBIF_USER and GBIF_PASSWORD (e.g. in a .env file at the project root).\n"
            "See .env.example for the template."
        )

    predicate = build_predicate(user, notify)

    if args.dry_run:
        print(json.dumps(predicate, indent=2))
        return 0

    if args.resume:
        key = args.resume.strip()
        print(f"[{now_iso()}] Resuming download key {key}")
    else:
        print(f"[{now_iso()}] Submitting GBIF download request as user '{user}'…")
        key = submit_download(predicate, user, password)
        print(f"[{now_iso()}] Download key: {key}")
        print(f"[{now_iso()}] Track at: https://www.gbif.org/occurrence/download/{key}")

    print(
        f"[{now_iso()}] Polling every {args.poll_seconds}s "
        f"(max wait {args.max_poll_hours}h)…"
    )
    deadline = time.time() + args.max_poll_hours * 3600
    info: dict = {}
    first = True
    while True:
        if not first:
            time.sleep(args.poll_seconds)
        first = False
        try:
            info = get_status(key)
        except urllib.error.URLError as e:
            print(f"[{now_iso()}] Network error while polling: {e}; retrying.")
            continue
        status = info.get("status", "?")
        size = info.get("size") or 0
        print(f"[{now_iso()}] status={status} size={size:,}")
        if status == TERMINAL_OK_STATE:
            break
        if status in TERMINAL_FAIL_STATES:
            sys.exit(f"GBIF download ended in terminal state {status}; aborting.")
        if time.time() > deadline:
            sys.exit(f"Timeout: download not ready after {args.max_poll_hours}h.")

    doi = info.get("doi") or ""
    if not doi:
        print("warning: no DOI returned by GBIF; will leave lib/citation.ts unchanged.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DATA_DIR / f"gbif-{key}.zip"
    print(f"[{now_iso()}] Downloading zip ({size:,} bytes) → {zip_path.name}")
    download_zip(key, zip_path)
    print(f"[{now_iso()}] Downloaded {zip_path.stat().st_size:,} bytes.")

    print(f"[{now_iso()}] Extracting SIMPLE_CSV → {TARGET_FILE.relative_to(ROOT)}")
    with zipfile.ZipFile(zip_path) as zf:
        # SIMPLE_CSV downloads contain a single .csv file (tab-delimited).
        members = [n for n in zf.namelist() if n.endswith(".csv")]
        if not members:
            sys.exit(f"No .csv member found in {zip_path.name}: {zf.namelist()}")
        member = members[0]
        tmp_target = TARGET_FILE.with_suffix(TARGET_FILE.suffix + ".part")
        with zf.open(member) as src, open(tmp_target, "wb") as dst:
            shutil.copyfileobj(src, dst, length=1024 * 1024)
        tmp_target.replace(TARGET_FILE)
    print(f"[{now_iso()}] Wrote {TARGET_FILE.stat().st_size:,} bytes.")

    try:
        zip_path.unlink()
        print(f"[{now_iso()}] Removed {zip_path.name}.")
    except OSError as e:
        print(f"[{now_iso()}] Could not remove {zip_path.name}: {e}")

    if doi:
        download_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        update_citation(doi, download_date)

    print()
    print("Done. Next steps:")
    print("  npm run build:data")
    print("  git add data/IN_data.txt public/data/ lib/citation.ts")
    print(f"  git commit -m 'Update GBIF data to {doi}'")
    print("  git push   # Vercel auto-redeploys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
