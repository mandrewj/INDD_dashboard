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
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def build_ssl_context() -> ssl.SSLContext:
    """Build an SSL context with a trustworthy CA bundle.

    python.org's macOS framework Python ships with an empty trust store and
    requires either Install Certificates.command or an explicit CA bundle.
    Prefer certifi (pip-installable, single-file, cross-platform); fall back
    to the system default for everywhere else.
    """
    try:
        import certifi  # type: ignore[import-not-found]
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL_CTX = build_ssl_context()

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
        with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
            return resp.read().decode().strip()
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sys.exit("GBIF authentication failed (401). Check GBIF_USER / GBIF_PASSWORD.")
        body = e.read().decode(errors="replace")
        sys.exit(f"GBIF returned HTTP {e.code} on submit: {body}")


# Transient network failures worth retrying (HTTPError is a URLError).
TRANSIENT = (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError)


def get_json(url: str, auth: str | None = None) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "INDD-Dashboard-Refresh/1.0"}
    if auth:
        headers["Authorization"] = auth
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
        return json.loads(resp.read())


def get_status(key: str) -> dict:
    return get_json(f"{API_BASE}/{key}")


def download_zip(key: str, dest: Path, expected_size: int = 0, attempts: int = 4) -> None:
    """Download with retries, then verify size and zip integrity."""
    url = f"{API_BASE}/request/{key}.zip"
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "INDD-Dashboard-Refresh/1.0"})
            with urllib.request.urlopen(req, timeout=300, context=SSL_CTX) as resp, open(tmp, "wb") as f:
                shutil.copyfileobj(resp, f, length=1024 * 1024)
            got = tmp.stat().st_size
            if expected_size and got != expected_size:
                raise ConnectionError(f"size mismatch: got {got:,} bytes, expected {expected_size:,}")
            with zipfile.ZipFile(tmp) as zf:
                bad = zf.testzip()
                if bad is not None:
                    raise ConnectionError(f"corrupt zip member {bad}")
            tmp.rename(dest)
            return
        except (*TRANSIENT, zipfile.BadZipFile) as e:
            if attempt == attempts:
                sys.exit(f"Download failed after {attempts} attempts: {e}")
            wait = 30 * attempt
            print(f"[{now_iso()}] Download attempt {attempt} failed ({e}); retrying in {wait}s.")
            time.sleep(wait)


# ---------- reuse of recent downloads ---------------------------------------

def predicate_signature(pred: dict) -> frozenset[tuple[str, str]]:
    """Normalized set of (KEY, value) equality clauses, for comparing ours
    with the predicate GBIF echoes back (which may add fields or reorder)."""
    out: set[tuple[str, str]] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "equals" and "key" in node:
                out.add((str(node["key"]).upper(), str(node.get("value", "")).lower()))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(pred)
    return frozenset(out)


def current_citation() -> tuple[str, str]:
    """(DOI, download date) currently in lib/citation.ts, or ("", "")."""
    if not CITATION_FILE.exists():
        return "", ""
    text = CITATION_FILE.read_text()
    doi = re.search(r'export const GBIF_DOI = "([^"]*)";', text)
    date = re.search(r'export const GBIF_DOWNLOAD_DATE = "([^"]*)";', text)
    return (doi.group(1) if doi else "", date.group(1) if date else "")


def find_reusable_download(user: str, password: str, predicate: dict, max_age_days: float = 4) -> tuple[str, str] | None:
    """Return (key, status) of a recent download with the same predicate that
    is still running, or finished and newer than the data we already have.

    GBIF can take hours to prepare a download. Without this, a CI run that
    times out throws that work away and the next run starts from scratch.
    """
    try:
        listing = get_json(
            f"{API_BASE}/user/{urllib.parse.quote(user)}?limit=20",
            auth=basic_auth_header(user, password),
        )
    except TRANSIENT as e:
        print(f"[{now_iso()}] Could not list previous downloads ({e}); submitting a new one.")
        return None
    ours = predicate_signature(predicate["predicate"])
    have_doi, have_date = current_citation()
    now = datetime.now(timezone.utc)
    for d in listing.get("results", []):
        req = d.get("request") or {}
        if req.get("format") != predicate["format"] or predicate_signature(req.get("predicate") or {}) != ours:
            continue
        try:
            created = datetime.fromisoformat(str(d.get("created", "")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (now - created).total_seconds() > max_age_days * 86400:
            continue
        status = d.get("status", "")
        if status in ("PREPARING", "RUNNING"):
            return d["key"], status
        if status == TERMINAL_OK_STATE and d.get("doi") != have_doi and created.date().isoformat() > have_date:
            return d["key"], status
    return None


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
        "--always-submit",
        action="store_true",
        help="Don't reuse a recent matching download; always submit a new one.",
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
    # Line-buffer output so progress shows up live in CI logs (block
    # buffering hid everything when earlier runs were cancelled mid-poll).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
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

    reuse = None if args.resume or args.always_submit else find_reusable_download(user, password, predicate)
    if args.resume:
        key = args.resume.strip()
        print(f"[{now_iso()}] Resuming download key {key}")
    elif reuse:
        key = reuse[0]
        print(f"[{now_iso()}] Reusing recent matching download {key} (status {reuse[1]})")
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
    failures = 0
    while True:
        if not first:
            time.sleep(args.poll_seconds)
        first = False
        if time.time() > deadline:
            sys.exit(
                f"Timeout: download {key} not ready after {args.max_poll_hours}h. "
                "It keeps preparing on GBIF; the next run will pick it up automatically."
            )
        try:
            info = get_status(key)
            failures = 0
        except TRANSIENT as e:
            failures += 1
            if failures >= 20:
                sys.exit(f"Giving up after {failures} consecutive polling errors: {e}")
            print(f"[{now_iso()}] Network error while polling ({failures}): {e}; retrying.")
            continue
        status = info.get("status", "?")
        size = info.get("size") or 0
        print(f"[{now_iso()}] status={status} size={size:,}")
        if status == TERMINAL_OK_STATE:
            break
        if status in TERMINAL_FAIL_STATES:
            sys.exit(f"GBIF download ended in terminal state {status}; aborting.")

    doi = info.get("doi") or ""
    if not doi:
        print("warning: no DOI returned by GBIF; will leave lib/citation.ts unchanged.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = DATA_DIR / f"gbif-{key}.zip"
    print(f"[{now_iso()}] Downloading zip ({size:,} bytes) → {zip_path.name}")
    download_zip(key, zip_path, expected_size=int(size or 0))
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
        if tmp_target.stat().st_size == 0:
            sys.exit(f"Extracted {member} is empty; leaving {TARGET_FILE.name} unchanged.")
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
