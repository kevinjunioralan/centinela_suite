#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROBOT_USER="${ROBOT_USER:-luis}"
SESSION="${SESSION:-monitor_demo}"
ACTION="${1:-full}"

heading() {
  echo
  echo "╔════════════════════════════════════════╗"
  echo "║ $1"
  echo "╚════════════════════════════════════════╝"
}

wait_for_apt_lock() {
  local max_wait=120
  local waited=0
  local interval=5

  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
    if [ "$waited" -eq 0 ]; then
      echo
      echo "⏳ Apt lock held by another process (robot running?). Waiting up to ${max_wait}s..."
    fi
    if [ "$waited" -ge "$max_wait" ]; then
      echo "⚠ Apt lock still held after ${max_wait}s. Skipping setup - install deps manually if needed."
      return 1
    fi
    sleep "$interval"
    waited=$((waited + interval))
    echo "  ... waited ${waited}s / ${max_wait}s"
  done

  if [ "$waited" -gt 0 ]; then
    echo "✓ Apt lock released after ${waited}s"
  fi
}

step() {
  echo
  echo "→ $1"
}

ok() {
  echo "✓ $1"
}

warn() {
  echo "⚠ $1"
}

fail() {
  echo "✗ $1"
  return 1
}

setup_environment() {
  heading "Setup Environment"

  if [[ $EUID -ne 0 ]]; then
    fail "setup requires root. Run: sudo $0 $ACTION"
    return 1
  fi

  step "Checking apt lock before installation..."
  wait_for_apt_lock || {
    warn "Skipping apt install - lock not released. If curl/tmux/multitail are already installed this is OK."
  }

  step "Installing dependencies and configuring sudoers..."
  if [ -f "$SCRIPTS_DIR/setup-ubuntu-robot.sh" ]; then
    bash "$SCRIPTS_DIR/setup-ubuntu-robot.sh" "$ROBOT_USER" && ok "Environment setup completed" || {
      fail "setup-ubuntu-robot.sh failed"
      return 1
    }
  else
    fail "setup-ubuntu-robot.sh not found in $SCRIPTS_DIR"
    return 1
  fi

  step "Asegurando permisos de ejecución en scripts..."
  find "$SCRIPTS_DIR" -name "*.sh" -exec chmod +x {} \; && ok "Scripts ejecutables: $SCRIPTS_DIR/*.sh" || warn "No se pudieron ajustar permisos de scripts"

  step "Creando directorios de logs y temporales..."
  local LOG_DIR="/var/log/centinela"
  mkdir -p "$LOG_DIR" && chown "$ROBOT_USER":"$ROBOT_USER" "$LOG_DIR" && ok "Directorio de logs: $LOG_DIR"
  local TEMP_DIR="/tmp/centinela-demo"
  mkdir -p "$TEMP_DIR" && chown "$ROBOT_USER":"$ROBOT_USER" "$TEMP_DIR" && ok "Directorio temporal: $TEMP_DIR"

  step "Verificando herramientas requeridas..."
  local missing_tools=()
  for tool in tmux curl multitail; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing_tools+=("$tool")
    fi
  done
  if [ "${#missing_tools[@]}" -eq 0 ]; then
    ok "Herramientas OK: tmux curl multitail"
  else
    warn "Herramientas no encontradas: ${missing_tools[*]} — pueden faltar tras el apt"
  fi
}

run_preflight() {
  heading "Preflight Checks"

  step "Running preflight validation for session '$SESSION'..."
  if [ -f "$SCRIPTS_DIR/preflight-demo.sh" ]; then
    if bash "$SCRIPTS_DIR/preflight-demo.sh" "$SESSION"; then
      ok "Preflight passed"
    else
      fail "Preflight failed - fix issues before proceeding"
      return 1
    fi
  else
    fail "preflight-demo.sh not found in $SCRIPTS_DIR"
    return 1
  fi
}

run_doctor() {
  heading "Monitor Doctor Check"

  step "Running doctor diagnostics for session '$SESSION'..."
  if [ -f "$SCRIPTS_DIR/monitor-demo-pretty.sh" ]; then
    if bash "$SCRIPTS_DIR/monitor-demo-pretty.sh" doctor "$SESSION"; then
      ok "Doctor check passed"
    else
      warn "Doctor check found issues - review them"
    fi
  else
    fail "monitor-demo-pretty.sh not found in $SCRIPTS_DIR"
    return 1
  fi
}

start_monitor() {
  heading "Starting Monitor Session"

  step "Starting tmux monitor session '$SESSION'..."
  if [ -f "$SCRIPTS_DIR/monitor-demo-pretty.sh" ]; then
    if bash "$SCRIPTS_DIR/monitor-demo-pretty.sh" start "$SESSION" &
    then
      sleep 2
      ok "Monitor session started in background"
    else
      fail "Failed to start monitor session"
      return 1
    fi
  else
    fail "monitor-demo-pretty.sh not found in $SCRIPTS_DIR"
    return 1
  fi
}

run_final_check() {
  heading "Final Pre-Demo Check (30 seconds)"

  step "Running final checks for session '$SESSION'..."
  if [ -f "$SCRIPTS_DIR/final-check.sh" ]; then
    if bash "$SCRIPTS_DIR/final-check.sh" "$SESSION"; then
      ok "All checks passed - READY FOR TRIBUNAL"
      return 0
    else
      fail "Final checks failed"
      return 1
    fi
  else
    fail "final-check.sh not found in $SCRIPTS_DIR"
    return 1
  fi
}

show_help() {
  cat <<EOF
Centinela Demo Orchestrator

Usage: $0 [ACTION] [OPTIONS]

Actions:
  prepare      [RECOMENDADO] Prepara la VM: setup + preflight + doctor + monitor
               (sin comprobar front/back — los levantas tú después)
  full         Execute all steps: setup → preflight → doctor → start → final-check
  setup        Run environment setup only (requires root)
  preflight    Run preflight validation only
  doctor       Run doctor diagnostics only
  start        Start monitor session only
  check        Run final check only
  restart      Stop and restart monitor session
  status       Show monitor session status
  logs         Attach to monitor session logs
  help         Show this help message

Environment Variables:
  ROBOT_USER   Username for robot operations (default: luis)
  SESSION      tmux session name (default: monitor_demo)

Examples:
  # Preparar VM (tú levantas front y back después)
  sudo $0 prepare

  # Full setup and start
  sudo $0 full

  # Just validate before demo
  $0 check

  # Custom robot user
  ROBOT_USER=centinela sudo $0 full

  # Restart monitor with custom session name
  SESSION=my_demo $0 restart

EOF
}

case "$ACTION" in
  prepare)
    heading "Preparando VM para Demo"
    setup_environment && \
    run_preflight && \
    run_doctor && \
    start_monitor
    echo
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  VM lista. Ahora levanta tú:                         ║"
    echo "║    BACKEND:  cd backend && node src/index.js         ║"
    echo "║    FRONTEND: cd frontend && npm run dev              ║"
    echo "║  Luego valida con:  $0 check                         ║"
    echo "╚══════════════════════════════════════════════════════╝"
    ;;
  setup)
    setup_environment
    ;;
  preflight)
    run_preflight
    ;;
  doctor)
    run_doctor
    ;;
  start)
    start_monitor
    ;;
  check)
    run_final_check
    ;;
  full)
    export ALLOW_APT_LOCKS=1
    setup_environment && \
    run_preflight && \
    run_doctor && \
    start_monitor && \
    run_final_check
    ;;
  restart)
    heading "Restarting Monitor"
    step "Stopping session '$SESSION'..."
    bash "$SCRIPTS_DIR/monitor-demo-pretty.sh" stop "$SESSION" 2>/dev/null || true
    sleep 1
    start_monitor
    ;;
  status)
    heading "Monitor Status"
    bash "$SCRIPTS_DIR/monitor-demo-pretty.sh" status "$SESSION"
    ;;
  logs)
    heading "Attaching to Monitor Logs"
    step "Press Ctrl+D or Ctrl+B then D to detach from tmux"
    bash "$SCRIPTS_DIR/monitor-demo-pretty.sh" attach "$SESSION"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Run '$0 help' for usage"
    exit 1
    ;;
esac
