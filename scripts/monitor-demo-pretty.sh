#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-start}"
SESSION="${2:-monitor_demo}"
APP_TAG="${APP_TAG:-centinela-robot}"
MONITOR_LAYOUT="${MONITOR_LAYOUT:-auto}"
CREATED_SESSION=0

LOCK_WATCH_CMD='while true; do date "+%F %T"; sudo -n bash -lc '"'"'for f in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock; do pids=$(fuser "$f" 2>/dev/null || true); if [ -n "$pids" ]; then for pid in $pids; do cmd=$(ps -p "$pid" -o args= 2>/dev/null | head -n 1); echo "$f pid=$pid cmd=$cmd"; done; fi; done'"'"'; echo "---"; sleep 2; done'
AUTH_WATCH_CMD='while true; do if sudo -n test -r /var/log/auth.log; then sudo -n tail -n 50 -F /var/log/auth.log | grep --line-buffered -Ei "sudo|COMMAND=|session opened|session closed|apt-get|dpkg"; else echo "$(date "+%F %T") [WARN] /var/log/auth.log not readable; auth stream disabled"; sleep 10; fi; done'

MULTITAIL_CMD="sudo -n multitail -s 2 \
-l \"journalctl -f -t ${APP_TAG} -o short-iso --no-pager\" \
-l \"tail -F /var/log/apt/history.log | grep --line-buffered -E 'Start-Date|Commandline:|Install:|Upgrade:|Remove:|Purge:|End-Date'\" \
-l \"tail -F /var/log/dpkg.log | grep --line-buffered -E ' install | upgrade | remove | purge |status installed|status half-installed'\" \
-l \"$AUTH_WATCH_CMD\" \
-l \"$LOCK_WATCH_CMD\""

cleanup_on_start_error() {
  local exit_code=$?
  if [ "$CREATED_SESSION" -eq 1 ] && tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION" || true
    echo "Startup failed, cleaned partial session '$SESSION'"
  fi
  exit "$exit_code"
}

check_log_readable() {
  local log_file="$1"
  local required="${2:-required}"

  if sudo -n test -r "$log_file" >/dev/null 2>&1; then
    echo "[OK] readable log: $log_file"
    return 0
  fi

  if [ "$required" = "required" ]; then
    echo "[FAIL] log not readable: $log_file"
    return 1
  fi

  echo "[WARN] optional log not readable: $log_file"
  return 0
}

should_use_multitail() {
  case "$MONITOR_LAYOUT" in
    multitail)
      command -v multitail >/dev/null 2>&1
      ;;
    fallback)
      return 1
      ;;
    auto|*)
      command -v multitail >/dev/null 2>&1
      ;;
  esac
}

lock_snapshot() {
  local lock_files
  local found=0
  lock_files="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock"

  echo "Apt/dpkg lock snapshot:"
  for f in $lock_files; do
    pids=$(sudo -n fuser "$f" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      found=1
      for pid in $pids; do
        cmd=$(ps -p "$pid" -o args= 2>/dev/null | head -n 1)
        echo "  $f pid=$pid cmd=${cmd:-unknown}"
      done
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo "  no active lock holders"
  fi
}

doctor() {
  local failed=0

  echo "Running monitor doctor checks..."

  if command -v tmux >/dev/null 2>&1; then
    echo "[OK] tmux installed"
  else
    echo "[FAIL] tmux missing"
    failed=1
  fi

  if command -v multitail >/dev/null 2>&1; then
    echo "[OK] multitail installed"
  else
    echo "[WARN] multitail missing (fallback layout will be used)"
  fi

  if sudo -n true >/dev/null 2>&1; then
    echo "[OK] sudo -n available"
  else
    echo "[FAIL] sudo -n not available (configure NOPASSWD for monitor user)"
    failed=1
  fi

  if command -v journalctl >/dev/null 2>&1; then
    echo "[OK] journalctl available"
  else
    echo "[FAIL] journalctl missing"
    failed=1
  fi

  if command -v tail >/dev/null 2>&1; then
    echo "[OK] tail available"
  else
    echo "[FAIL] tail missing"
    failed=1
  fi

  if command -v grep >/dev/null 2>&1; then
    echo "[OK] grep available"
  else
    echo "[FAIL] grep missing"
    failed=1
  fi

  if command -v fuser >/dev/null 2>&1; then
    echo "[OK] fuser available"
  else
    echo "[FAIL] fuser missing"
    failed=1
  fi

  if command -v ps >/dev/null 2>&1; then
    echo "[OK] ps available"
  else
    echo "[FAIL] ps missing"
    failed=1
  fi

  if command -v date >/dev/null 2>&1; then
    echo "[OK] date available"
  else
    echo "[FAIL] date missing"
    failed=1
  fi

  if check_log_readable "/var/log/apt/history.log" required; then :; else failed=1; fi
  if check_log_readable "/var/log/dpkg.log" required; then :; else failed=1; fi
  if check_log_readable "/var/log/auth.log" optional; then :; else :; fi

  case "$MONITOR_LAYOUT" in
    auto|multitail|fallback)
      echo "[OK] monitor layout: $MONITOR_LAYOUT"
      ;;
    *)
      echo "[FAIL] invalid MONITOR_LAYOUT='$MONITOR_LAYOUT' (allowed: auto|multitail|fallback)"
      failed=1
      ;;
  esac

  lock_snapshot

  if [ "$failed" -ne 0 ]; then
    echo "Doctor checks failed"
    return 1
  fi

  echo "Doctor checks passed"
}

start_with_multitail() {
  tmux new-session -d -s "$SESSION" "$MULTITAIL_CMD"
  tmux set-option -t "$SESSION" remain-on-exit on >/dev/null 2>&1 || true

  # Si multitail termina instantaneamente, retrocede al layout fallback.
  sleep 1
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "multitail ended immediately, switching to fallback layout"
    fallback_start
    return 1
  fi

  return 0
}

fallback_start() {
  tmux new-session -d -s "$SESSION" "sudo -n journalctl -f -t $APP_TAG -o short-iso --no-pager"
  tmux split-window -h -t "$SESSION" "sudo -n tail -F /var/log/apt/history.log | grep --line-buffered -E 'Start-Date|Commandline:|Install:|Upgrade:|Remove:|Purge:|End-Date'"
  tmux split-window -v -t "$SESSION":0.0 "sudo -n tail -F /var/log/dpkg.log | grep --line-buffered -E ' install | upgrade | remove | purge |status installed|status half-installed'"
  tmux split-window -v -t "$SESSION":0.1 "$AUTH_WATCH_CMD"
  tmux split-window -v -t "$SESSION":0.2 "$LOCK_WATCH_CMD"
  tmux select-layout -t "$SESSION" tiled
  tmux set-option -t "$SESSION" remain-on-exit on >/dev/null 2>&1 || true
}

stop_session() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    echo "Session '$SESSION' stopped"
  else
    echo "Session '$SESSION' is not running"
  fi
}

restart_session() {
  stop_session
  start_session
}

start_session() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Session '$SESSION' already exists"
    return 0
  fi

  CREATED_SESSION=0
  trap cleanup_on_start_error ERR INT TERM

  if should_use_multitail; then
    CREATED_SESSION=1
    if start_with_multitail; then
      echo "Session '$SESSION' started (layout: multitail)"
    else
      echo "Session '$SESSION' started (layout: fallback)"
    fi
  else
    CREATED_SESSION=1
    fallback_start
    echo "Session '$SESSION' started (layout: fallback)"
  fi

  trap - ERR INT TERM
}

case "$ACTION" in
  prepare)
    sudo apt-get update -y
    sudo apt-get install -y tmux multitail
    echo "Dependencies installed: tmux, multitail"
    ;;
  start)
    if ! sudo -n true >/dev/null 2>&1; then
      echo "sudo -n is required for stable demo monitor. Configure NOPASSWD for this user."
      exit 1
    fi
    if ! command -v tmux >/dev/null 2>&1; then
      echo "tmux is required. Run: $0 prepare"
      exit 1
    fi
    start_session
    tmux attach -t "$SESSION"
    ;;
  attach)
    tmux attach -t "$SESSION"
    ;;
  stop)
    stop_session
    ;;
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "Session '$SESSION' is running"
    else
      echo "Session '$SESSION' is not running"
    fi
    lock_snapshot
    ;;
  locks)
    lock_snapshot
    ;;
  doctor)
    doctor
    ;;
  restart)
    if ! command -v tmux >/dev/null 2>&1; then
      echo "tmux is required. Run: $0 prepare"
      exit 1
    fi
    if ! sudo -n true >/dev/null 2>&1; then
      echo "sudo -n is required for stable demo monitor. Configure NOPASSWD for this user."
      exit 1
    fi
    restart_session
    tmux attach -t "$SESSION"
    ;;
  *)
    echo "Usage: $0 {prepare|start|attach|stop|status|locks|doctor|restart} [session_name]"
    echo "Env: MONITOR_LAYOUT=auto|multitail|fallback APP_TAG=centinela-robot"
    exit 1
    ;;
esac
