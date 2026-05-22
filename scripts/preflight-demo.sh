#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3012/api/centinela-banco-pruebas/estado}"
MIN_DISK_MB="${MIN_DISK_MB:-2048}"
MIN_MEM_MB="${MIN_MEM_MB:-256}"
ROBOT_HOST="${ROBOT_HOST:-}"
ROBOT_USER="${ROBOT_USER:-}"
ALLOW_APT_LOCKS="${ALLOW_APT_LOCKS:-0}"
SKIP_BACKEND_CHECK="${SKIP_BACKEND_CHECK:-0}"

FAILED=0
WARNINGS=0

ok() {
  echo "[OK] $1"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  echo "[WARN] $1"
}

fail() {
  FAILED=$((FAILED + 1))
  echo "[FAIL] $1"
}

check_cmd() {
  local cmd="$1"
  local optional="${2:-}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "command '$cmd' available"
  elif [ "$optional" = "optional" ]; then
    warn "command '$cmd' missing (optional)"
  else
    fail "command '$cmd' missing"
  fi
}

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 "$url" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=5 "$url" >/dev/null 2>&1
  else
    return 1
  fi
}

check_backend_health() {
  if [ "$SKIP_BACKEND_CHECK" = "1" ]; then
    warn "backend health check skipped (SKIP_BACKEND_CHECK=1)"
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    fail "backend health check skipped: neither curl nor wget available"
    return 0
  fi
  if http_get "$HEALTH_URL"; then
    ok "backend health endpoint reachable: $HEALTH_URL"
  else
    fail "backend health endpoint failed: $HEALTH_URL"
  fi
}

check_sudo_non_interactive() {
  if sudo -n true >/dev/null 2>&1; then
    ok "sudo -n available"
  else
    fail "sudo -n unavailable (configure NOPASSWD for demo user)"
  fi
}

check_disk() {
  local avail_mb
  avail_mb=$(df -Pm / | awk 'NR==2 {print $4}')
  if [ -n "$avail_mb" ] && [ "$avail_mb" -ge "$MIN_DISK_MB" ]; then
    ok "disk free on /: ${avail_mb}MB (min ${MIN_DISK_MB}MB)"
  else
    fail "low disk free on /: ${avail_mb:-unknown}MB (min ${MIN_DISK_MB}MB)"
  fi
}

check_memory() {
  local avail_mb
  avail_mb=$(free -m | awk '/Mem:/ {print $7}')
  if [ -n "$avail_mb" ] && [ "$avail_mb" -ge "$MIN_MEM_MB" ]; then
    ok "memory available: ${avail_mb}MB (min ${MIN_MEM_MB}MB)"
  else
    fail "low memory available: ${avail_mb:-unknown}MB (min ${MIN_MEM_MB}MB)"
  fi
}

check_apt_locks() {
  local lock_files
  local found=0
  local pids
  lock_files="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock"

  for f in $lock_files; do
    pids=$(sudo -n fuser "$f" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      found=1
      warn "lock active in $f by pids: $pids"
    fi
  done

  if [ "$found" -eq 0 ]; then
    ok "no active apt/dpkg locks"
  elif [ "$ALLOW_APT_LOCKS" != "1" ]; then
    fail "active apt/dpkg locks detected (set ALLOW_APT_LOCKS=1 to continue)"
  fi
}

check_tmux_session_conflict() {
  local session_name="${1:-monitor_demo}"
  if tmux has-session -t "$session_name" 2>/dev/null; then
    warn "tmux session '$session_name' already running"
  else
    ok "tmux session '$session_name' is free"
  fi
}

check_robot_ssh_optional() {
  if [ -z "$ROBOT_HOST" ] || [ -z "$ROBOT_USER" ]; then
    return 0
  fi

  if ssh -o BatchMode=yes -o ConnectTimeout=5 "$ROBOT_USER@$ROBOT_HOST" "echo ok" >/dev/null 2>&1; then
    ok "robot SSH reachable: $ROBOT_USER@$ROBOT_HOST"
  else
    fail "robot SSH check failed: $ROBOT_USER@$ROBOT_HOST"
  fi
}

main() {
  local session_name
  session_name="${1:-monitor_demo}"

  echo "=== Centinela Demo Preflight ==="
  echo "Health URL: $HEALTH_URL"
  echo "Session: $session_name"
  echo

  check_cmd curl optional
  check_cmd tmux
  check_cmd sudo
  check_cmd ssh

  check_sudo_non_interactive
  check_backend_health
  check_disk
  check_memory
  check_apt_locks
  check_tmux_session_conflict "$session_name"
  check_robot_ssh_optional

  echo
  echo "Summary: FAIL=$FAILED WARN=$WARNINGS"

  if [ "$FAILED" -ne 0 ]; then
    exit 1
  fi
}

main "$@"
