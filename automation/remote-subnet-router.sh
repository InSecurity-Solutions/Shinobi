#!/bin/bash
# =============================================================================
# remote-subnet-router.sh - Configura um device no SITE REMOTO (RPi/mini-PC)
# como Tailscale subnet-router, expondo a rede das cameras/NVR para o tailnet.
# Assim o Shinobi (no site central) puxa RTSP do NVR pelo IP privado.
#
# USO:
#   sudo bash remote-subnet-router.sh <CAMERA_SUBNET_CIDR> [hostname]
# EX.:
#   sudo bash remote-subnet-router.sh 192.168.0.0/24 nvr-edge-site1
#
# Depois de rodar: aprove a rota no admin do Tailscale
#   (Machines -> este device -> Edit route settings -> aprovar a subnet).
# =============================================================================
set -euo pipefail

SUBNET="${1:-}"
HOSTNAME_TS="${2:-nvr-edge}"
if [ -z "$SUBNET" ]; then
    echo "ERRO: informe a subnet das cameras. Ex.: sudo bash $0 192.168.0.0/24 nvr-edge-site1"
    exit 1
fi

echo "============= [edge] Instalando Tailscale ============="
if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "============= [edge] Habilitando IP forwarding ============="
echo 'net.ipv4.ip_forward = 1'  | tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | tee -a /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf

echo "============= [edge] Subindo como subnet-router ============="
echo "Vai abrir uma URL de login OU use --authkey. Subnet anunciada: $SUBNET"
tailscale up --advertise-routes="$SUBNET" --hostname="$HOSTNAME_TS" --accept-routes

echo "============================================================="
echo " Subnet-router no ar. Subnet anunciada: $SUBNET"
echo " >>> APROVE a rota no admin: https://login.tailscale.com/admin/machines"
echo "     ($HOSTNAME_TS -> Edit route settings -> aprovar $SUBNET)"
echo " Depois, o Shinobi (100.85.135.1) alcanca o NVR/cameras nessa subnet."
echo "============================================================="
