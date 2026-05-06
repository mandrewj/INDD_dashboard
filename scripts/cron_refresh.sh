#!/bin/bash
#
# Weekly automated refresh of the INDD dashboard data.
#
# Submits a fresh GBIF download, regenerates the static JSON bundle,
# commits and pushes changes to GitHub (Vercel auto-deploys).
#
# Triggered by ~/Library/LaunchAgents/com.iddl.indd-dashboard-refresh.plist
# but safe to invoke manually:  bash scripts/cron_refresh.sh
#
# On any failure, a macOS notification banner pops up and a single-line
# entry is appended to ~/Library/Logs/INDD_dashboard_refresh.log. Full
# stdout/stderr from each run is captured by launchd at:
#   ~/Library/Logs/INDD_dashboard_refresh.out.log
#   ~/Library/Logs/INDD_dashboard_refresh.err.log

set -u
set -o pipefail

# --- Setup ---------------------------------------------------------------

# launchd's PATH is minimal; restore the tools we need.
export PATH="/usr/local/bin:/opt/homebrew/bin:/Library/Frameworks/Python.framework/Versions/3.13/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_DIR="/Users/andrew/Documents/Research/AI_workflows/INDD_dashboard"
LOG_FILE="$HOME/Library/Logs/INDD_dashboard_refresh.log"
RUN_ID="$(date '+%Y-%m-%dT%H:%M:%S')"

mkdir -p "$(dirname "$LOG_FILE")"
cd "$PROJECT_DIR" || {
  echo "$RUN_ID  FAIL  cannot cd into $PROJECT_DIR" >>"$LOG_FILE"
  osascript -e "display notification \"Cannot enter project directory.\" with title \"INDD refresh failed\" sound name \"Funk\"" 2>/dev/null
  exit 1
}

# --- Failure handler ------------------------------------------------------

fail() {
  local stage="$1"
  local detail="${2:-(no detail)}"
  echo "$RUN_ID  FAIL  stage=$stage  $detail" >>"$LOG_FILE"
  osascript -e "display notification \"Failed at: $stage. See ~/Library/Logs/INDD_dashboard_refresh.err.log\" with title \"INDD weekly refresh failed\" sound name \"Funk\"" 2>/dev/null
  exit 1
}

trap 'fail "unexpected" "exit code $?"' ERR
set -e

echo "=== $RUN_ID  starting weekly refresh ==="
echo "=== $RUN_ID  starting weekly refresh ===" >>"$LOG_FILE"

# --- 1. Refresh GBIF data ------------------------------------------------

echo "--- npm run refresh:gbif ---"
if ! npm run refresh:gbif --silent; then
  fail "refresh:gbif" "GBIF refresh script failed"
fi

# --- 2. Rebuild static JSON bundle ---------------------------------------

echo "--- npm run build:data ---"
if ! npm run build:data --silent; then
  fail "build:data" "data bundle regeneration failed"
fi

# --- 3. Commit + push (only if anything actually changed) ---------------

# Re-check what's dirty after refresh + build.
STAGEABLE="lib/citation.ts public/data/dictionaries.json public/data/records.json public/data/precomputed.json"

# Are any of those tracked files changed?
if git diff --quiet -- $STAGEABLE; then
  echo "$RUN_ID  OK    no diff after refresh; nothing to commit" >>"$LOG_FILE"
  echo "=== $RUN_ID  no changes, exiting clean ==="
  exit 0
fi

# Pull the new DOI for the commit message.
NEW_DOI="$(grep -oE '"10\.[0-9]+/[a-z0-9.]+"' lib/citation.ts | head -1 | tr -d '"')"

git add $STAGEABLE
git commit -m "Auto-refresh GBIF data to ${NEW_DOI:-unknown DOI}

Pulled by scripts/cron_refresh.sh on $RUN_ID."
if ! git push; then
  fail "git push" "commit landed locally but push to origin failed"
fi

echo "$RUN_ID  OK    pushed ${NEW_DOI:-(no DOI captured)}" >>"$LOG_FILE"
echo "=== $RUN_ID  done — pushed ${NEW_DOI} ==="

# Silent on success — no notification banner.
exit 0
