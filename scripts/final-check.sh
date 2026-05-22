#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-monitor_demo}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3012/api/centinela-banco-pruebas/estado}"
FRONTEND_URL_PRIMARY="${FRONTEND_URL_PRIMARY:-http://localhost:5173/}"
FRONTEND_URL_FALLBACK="${FRONTEND_URL_FALLBACK:-http://localhost:3000/}"
SKIP_BACKEND_CHECK="${SKIP_BACKEND_CHECK:-0}"
SKIP_FRONTEND_CHECK="${SKIP_FRONTEND_CHECK:-0}"
EXPECTED_PACK="${EXPECTED_PACK:-}"
NGINX_HTTP_PORT="${NGINX_HTTP_PORT:-80}"
POSTGRES_DB_NAME="${POSTGRES_DB_NAME:-centinela_app}"
DOMINIO_ESPERADO="${DOMINIO_ESPERADO:-empresa.local}"
DHCP_RANGO_INICIO="${DHCP_RANGO_INICIO:-192.168.1.100}"
DHCP_RANGO_FIN="${DHCP_RANGO_FIN:-192.168.1.200}"
CHECKS_PASSED=0
CHECKS_FAILED=0

heading() {
  echo
  echo "=== $1 ==="
}

ok() {
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
  echo "✓ $1"
}

fail() {
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
  echo "✗ $1"
}

http_get() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 4 "$url" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=4 "$url" >/dev/null 2>&1
  else
    return 1
  fi
}

check_service_active() {
  local service_name="$1"
  if sudo -n systemctl is-active --quiet "$service_name"; then
    ok "Service active: $service_name"
  else
    fail "Service NOT active: $service_name"
  fi
}

check_file_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if sudo -n test -r "$file" && sudo -n grep -Eq "$pattern" "$file"; then
    ok "$label"
  else
    fail "$label"
  fi
}

check_postgres_db_exists() {
  local db_name="$1"
  if sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1; then
    ok "PostgreSQL database exists: $db_name"
  else
    fail "PostgreSQL database missing: $db_name"
  fi
}

heading "Backend Health"
if [ "$SKIP_BACKEND_CHECK" = "1" ]; then
  echo "⚠ Backend check skipped (SKIP_BACKEND_CHECK=1)"
elif http_get "$HEALTH_URL"; then
  ok "Backend reachable: $HEALTH_URL"
else
  fail "Backend unreachable: $HEALTH_URL"
  if command -v ss >/dev/null 2>&1; then
    echo "  Diagnostic (listening ports related to node/3012):"
    ss -ltnp 2>/dev/null | grep -E '(:3012|node)' || true
  fi
fi

heading "Frontend"
if [ "$SKIP_FRONTEND_CHECK" = "1" ]; then
  echo "⚠ Frontend check skipped (SKIP_FRONTEND_CHECK=1)"
elif http_get "$FRONTEND_URL_PRIMARY" || http_get "$FRONTEND_URL_FALLBACK"; then
  ok "Frontend reachable"
else
  fail "Frontend unreachable (tried $FRONTEND_URL_PRIMARY and $FRONTEND_URL_FALLBACK)"
fi

heading "Monitor Session"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  ok "Monitor session '$SESSION' is running"
else
  fail "Monitor session '$SESSION' is NOT running"
fi

heading "System Resources"
DISK=$(df -Pm / | awk 'NR==2 {print $4}')
if [ "$DISK" -ge 1000 ]; then
  ok "Disk free: ${DISK}MB"
else
  fail "Low disk: ${DISK}MB"
fi

MEM=$(free -m | awk '/Mem:/ {print $7}')
if [ "$MEM" -ge 200 ]; then
  ok "Memory available: ${MEM}MB"
else
  fail "Low memory: ${MEM}MB"
fi

heading "Apt/Dpkg Locks"
LOCK_COUNT=$(sudo -n fuser /var/lib/dpkg/lock 2>/dev/null | wc -w || echo 0)
if [ "$LOCK_COUNT" -eq 0 ]; then
  ok "No apt/dpkg locks"
else
  echo "⚠ Lock holders detected: $LOCK_COUNT pid(s)"
  echo "  If demo just finished installation, this is OK."
fi

heading "SSH to Robots"
if [ -n "${ROBOT_HOST:-}" ] && [ -n "${ROBOT_USER:-}" ]; then
  if ssh -o BatchMode=yes -o ConnectTimeout=3 "${ROBOT_USER}@${ROBOT_HOST}" "echo ok" >/dev/null 2>&1; then
    ok "Robot SSH reachable"
  else
    echo "⚠ Robot SSH unreachable (might not be needed)"
  fi
fi

if [ -n "$EXPECTED_PACK" ]; then
  heading "Pack Smoke (${EXPECTED_PACK})"

  case "$EXPECTED_PACK" in
    pack_web)
      check_service_active "nginx"
      check_service_active "postgresql"
      check_file_contains "/etc/nginx/sites-available/default" "listen ${NGINX_HTTP_PORT} default_server;" "Nginx configured with expected HTTP port ${NGINX_HTTP_PORT}"
      check_postgres_db_exists "$POSTGRES_DB_NAME"
      ;;
    pack_dominio)
      check_service_active "bind9"
      check_service_active "isc-dhcp-server"
      check_file_contains "/etc/bind/named.conf.options" "forwarders" "Bind9 forwarders configured"
      check_file_contains "/etc/dhcp/dhcpd.conf" "range ${DHCP_RANGO_INICIO} ${DHCP_RANGO_FIN};" "DHCP range configured (${DHCP_RANGO_INICIO}-${DHCP_RANGO_FIN})"
      check_file_contains "/etc/dhcp/dhcpd.conf" "option domain-name \"${DOMINIO_ESPERADO}\";" "DHCP domain configured (${DOMINIO_ESPERADO})"
      ;;
    *)
      fail "Unsupported EXPECTED_PACK='${EXPECTED_PACK}' (use pack_web or pack_dominio)"
      ;;
  esac
fi

echo
echo "========================================="
echo "Summary: PASS=$CHECKS_PASSED FAIL=$CHECKS_FAILED"
echo "========================================="

if [ "$CHECKS_FAILED" -eq 0 ]; then
  echo "✓ Ready for tribunal demo"
  exit 0
else
  echo "✗ Issues detected - fix before proceeding"
  exit 1
fi
