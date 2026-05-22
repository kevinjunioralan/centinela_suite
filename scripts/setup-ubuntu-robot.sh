#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root"
  exit 1
fi

ROBOT_USER="${1:-}"
if [[ -z "$ROBOT_USER" ]]; then
  echo "Usage: sudo ./setup-ubuntu-robot.sh <robot_user>"
  exit 1
fi

if ! id "$ROBOT_USER" >/dev/null 2>&1; then
  echo "User '$ROBOT_USER' does not exist"
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PRETTY_MONITOR_SOURCE="$SCRIPT_DIR/monitor-demo-pretty.sh"
PRETTY_MONITOR_TARGET="/usr/local/bin/monitor-demo-pretty.sh"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y tmux rsyslog sudo multitail curl
systemctl enable --now rsyslog

if [[ -f "$PRETTY_MONITOR_SOURCE" ]]; then
  install -m 0755 "$PRETTY_MONITOR_SOURCE" "$PRETTY_MONITOR_TARGET"
fi

SUDOERS_FILE="/etc/sudoers.d/90-centinela-robot"
cat > "$SUDOERS_FILE" <<EOF
$ROBOT_USER ALL=(root) NOPASSWD:SETENV: /usr/bin/true, /usr/bin/apt-get, /usr/bin/dpkg, /usr/bin/systemctl, /usr/bin/logger, /usr/bin/journalctl, /usr/bin/tail, /usr/bin/tmux, /usr/bin/multitail, /bin/rm, /bin/bash
Defaults:$ROBOT_USER !requiretty
EOF

chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

echo "Ubuntu robot setup completed"
echo "User: $ROBOT_USER"
echo "Sudoers: $SUDOERS_FILE"
echo "Pretty monitor: $PRETTY_MONITOR_TARGET"
