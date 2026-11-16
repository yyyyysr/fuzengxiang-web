#!/usr/bin/env bash
# Install / update the site on a Linux server (run as root).
#
#   DEEPSEEK_API_KEY=sk-... bash install.sh /tmp/fuzengxiang-deploy.tar.gz [port]
#
# - unpacks to /opt/fuzengxiang/{app,kb}
# - picks a free port (or uses the one given / already configured)
# - writes DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL as server-wide
#   environment variables (/etc/environment + /etc/profile.d/deepseek.sh)
# - runs the app as systemd service "fuzengxiang"
set -euo pipefail

PKG="${1:-/tmp/fuzengxiang-deploy.tar.gz}"
WANT_PORT="${2:-}"
BASE=/opt/fuzengxiang
UNIT=/etc/systemd/system/fuzengxiang.service
DS_BASE_URL="${DEEPSEEK_BASE_URL:-https://api.deepseek.com}"
DS_MODEL="${DEEPSEEK_MODEL:-deepseek-flash}"

port_busy() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }

pick_port() {
  if [[ -n "$WANT_PORT" ]]; then echo "$WANT_PORT"; return; fi
  if [[ -f "$UNIT" ]]; then
    local cur; cur=$(grep -oP 'Environment=PORT=\K[0-9]+' "$UNIT" || true)
    if [[ -n "$cur" ]]; then echo "$cur"; return; fi
  fi
  for p in 8600 8610 8620 8686 8700 8760 8800 9600 9686; do
    if ! port_busy "$p"; then echo "$p"; return; fi
  done
  echo "no free port found" >&2; exit 1
}

echo "==> unpack $PKG"
mkdir -p "$BASE"
systemctl stop fuzengxiang 2>/dev/null || true
rm -rf "$BASE/app" "$BASE/kb"
tar -xzf "$PKG" -C "$BASE"

echo "==> python venv"
if ! command -v python3 >/dev/null; then
  (command -v apt-get && apt-get update && apt-get install -y python3 python3-venv) || (command -v dnf && dnf install -y python3) || yum install -y python3
fi
if ! python3 -m venv "$BASE/venv" 2>/dev/null; then
  command -v apt-get >/dev/null && apt-get install -y python3-venv
  python3 -m venv "$BASE/venv"
fi
"$BASE/venv/bin/pip" install -q --upgrade pip -i https://mirrors.cloud.tencent.com/pypi/simple || true
"$BASE/venv/bin/pip" install -q -r "$BASE/app/deploy/requirements-server.txt" -i https://mirrors.cloud.tencent.com/pypi/simple

echo "==> global environment variables"
if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  sed -i '/^DEEPSEEK_\(API_KEY\|BASE_URL\|MODEL\)=/d' /etc/environment
  {
    echo "DEEPSEEK_API_KEY=\"$DEEPSEEK_API_KEY\""
    echo "DEEPSEEK_BASE_URL=\"$DS_BASE_URL\""
    echo "DEEPSEEK_MODEL=\"$DS_MODEL\""
  } >> /etc/environment
  cat > /etc/profile.d/deepseek.sh <<EOF
export DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
export DEEPSEEK_BASE_URL="$DS_BASE_URL"
export DEEPSEEK_MODEL="$DS_MODEL"
EOF
  chmod 644 /etc/profile.d/deepseek.sh
else
  echo "    DEEPSEEK_API_KEY not given; keeping existing /etc/environment"
fi

PORT=$(pick_port)
echo "==> systemd service on port $PORT"
cat > "$UNIT" <<EOF
[Unit]
Description=Fu Zengxiang collector agent website
After=network.target

[Service]
WorkingDirectory=$BASE/app
EnvironmentFile=/etc/environment
Environment=KB_ROOT=$BASE/kb
Environment=HOST=0.0.0.0
Environment=PORT=$PORT
Environment=ENABLE_DENSE=1
Environment=DENSE_THREADS=2
Environment=PYTHONIOENCODING=utf-8
ExecStart=$BASE/venv/bin/python $BASE/app/server/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now fuzengxiang

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow "$PORT/tcp"; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" && firewall-cmd --reload
fi

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
echo "==> health"
curl -fsS "http://127.0.0.1:$PORT/api/health" | head -c 400; echo
echo "DONE port=$PORT"
