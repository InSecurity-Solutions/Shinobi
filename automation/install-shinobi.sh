#!/bin/bash
# =============================================================================
# install-shinobi.sh - Instalacao touchless e idempotente do Shinobi 2.0
# Motor de video do NeoVigia. Roda dentro da VM Ubuntu 22.04 (via cloud-init)
# ou manualmente. NAO interativo.
#
# Le variaveis de /etc/shinobi-install.env (se existir):
#   SHINOBI_DIR, SHINOBI_REPO, SHINOBI_BRANCH,
#   SHINOBI_SUPERUSER_EMAIL, SHINOBI_SUPERUSER_MD5,
#   SHINOBI_DB_NAME, SHINOBI_DB_USER, SHINOBI_DB_PASSWORD
# Tambem aceita as mesmas variaveis vindas do ambiente.
# =============================================================================
set -euo pipefail

[ -f /etc/shinobi-install.env ] && . /etc/shinobi-install.env

SHINOBI_DIR="${SHINOBI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SUPER_EMAIL="${SHINOBI_SUPERUSER_EMAIL:-admin@shinobi.video}"
# MD5 de "admin" como fallback (TROQUE em producao via env)
SUPER_MD5="${SHINOBI_SUPERUSER_MD5:-21232f297a57a5a743894a0e4a801fc3}"
DB_NAME="${SHINOBI_DB_NAME:-ccio}"
DB_USER="${SHINOBI_DB_USER:-majesticflame}"
DB_PASS="${SHINOBI_DB_PASSWORD:-}"

log(){ echo "============= [shinobi-install] $* ============="; }
export DEBIAN_FRONTEND=noninteractive

cd "$SHINOBI_DIR"
log "Diretorio: $SHINOBI_DIR"

# ---------- 1. Pacotes de build (CORRECAO do bug gcc-8 do touchless) ----------
log "Instalando toolchain de build"
apt-get update -y
apt-get install -y build-essential cmake make zip git curl net-tools dos2unix ca-certificates gnupg lsb-release ufw

# ---------- 2. Node.js (NodeSource) ----------
if ! command -v node >/dev/null 2>&1; then
    log "Instalando Node.js $NODE_MAJOR"
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
else
    log "Node.js ja presente: $(node -v)"
fi

# ---------- 3. FFmpeg ----------
if ! command -v ffmpeg >/dev/null 2>&1; then
    log "Instalando FFmpeg"
    apt-get install -y ffmpeg
else
    log "FFmpeg ja presente"
fi

# ---------- 4. MariaDB ----------
if ! command -v mysql >/dev/null 2>&1 && ! command -v mariadb >/dev/null 2>&1; then
    log "Instalando MariaDB"
    apt-get install -y mariadb-server
fi
systemctl enable mariadb >/dev/null 2>&1 || true
systemctl start mariadb || service mysql start || service mariadb start || true

# ---------- 5. Banco de dados ----------
log "Criando banco/usuario (idempotente via sql/user.sql)"
mysql -u root -e "source ${SHINOBI_DIR}/sql/user.sql" || true

# ---------- 6. conf.json ----------
if [ ! -e ./conf.json ]; then
    log "Gerando conf.json"
    cp conf.sample.json conf.json
fi
CRON_KEY="$(head -c 64 < /dev/urandom | sha256sum | awk '{print substr($1,1,60)}')"
DB_JSON="{\"host\":\"127.0.0.1\",\"user\":\"${DB_USER}\",\"password\":\"${DB_PASS}\",\"database\":\"${DB_NAME}\",\"port\":3306}"
node tools/modifyConfiguration.js \
    db="$DB_JSON" \
    databaseType="mysql" \
    addToConfig="{\"cron\":{\"key\":\"${CRON_KEY}\"}}"

# ---------- 7. super.json (senha forte, NUNCA admin/admin em prod) ----------
log "Escrevendo super.json (Superuser: ${SUPER_EMAIL})"
printf '[{"mail":"%s","pass":"%s"}]\n' "$SUPER_EMAIL" "$SUPER_MD5" > super.json
chmod 600 super.json

# ---------- 8. NPM + PM2 ----------
log "npm install (pode demorar)"
npm install --unsafe-perm
log "Instalando PM2"
npm install -g pm2@latest

# ---------- 9. Firewall ----------
log "Configurando UFW (OpenSSH + 8080)"
ufw allow OpenSSH || true
ufw allow 8080/tcp || true
yes | ufw enable || true

# ---------- 10. Start + boot ----------
chmod -R 755 .
touch INSTALL/installed.txt
log "Iniciando Shinobi via PM2"
pm2 start camera.js --name camera || pm2 restart camera
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save

# ---------- 11. Healthcheck ----------
log "Healthcheck em http://localhost:8080"
ok=0
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://localhost:8080"; then ok=1; break; fi
    sleep 2
done
IP="$(hostname -I | awk '{print $1}')"
if [ "$ok" = "1" ]; then
    log "OK! Shinobi respondendo. Superuser: http://${IP}:8080/super"
else
    log "ATENCAO: :8080 nao respondeu no tempo. Ver: pm2 logs camera"
fi
echo "====================================="
echo " Shinobi NeoVigia instalado"
echo " URL Superuser : http://${IP}:8080/super"
echo " Superuser     : ${SUPER_EMAIL}"
echo " Logs install  : /var/log/shinobi-install.log"
echo "====================================="
