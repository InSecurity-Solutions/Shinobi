# Deploy nativo — Hyper-V + Ubuntu 22.04 (fork do NeoVigia)

> Método escolhido: **instalação nativa do nosso fork** (não Docker), para facilitar customização.
> O Shinobi é feito para Linux; no Windows 11 rodamos numa VM Linux via Hyper-V.

## Requisitos (oficiais + observados)
| Componente | Versão | Observação |
|---|---|---|
| SO | Ubuntu 22.04 LTS | doc recomenda máquina dedicada |
| Node.js | 18–22 | `INSTALL/nodejs-ubuntu.sh` instala **22** no 22.04; doc cita 16 (legado) |
| FFmpeg | 4.x+ | doc cita 3.3–4.1; o `apt` do 22.04 (4.4+) funciona |
| MariaDB | 10.4+ | banco `ccio` |
| PM2 | global | mantém `camera.js` vivo |

## Parte A — VM no Hyper-V
1. Criar **VM Geração 2**, Ubuntu Server **22.04 LTS**.
2. Recursos: mínimo **2 vCPU / 4 GB RAM**; suba pra 4–8 GB conforme nº de câmeras. Disco generoso (vídeo consome rápido).
3. **Rede:** criar **Virtual Switch Externo** (vinculado à NIC física) e conectar a VM. Essencial para enxergar câmeras IP na LAN.
4. **Desabilitar Secure Boot** (ou usar template "Microsoft UEFI Certificate Authority"), senão o Ubuntu não dá boot.

## Parte B — Instalar o Shinobi (nosso fork)
```bash
sudo apt update && sudo apt install -y git curl
git clone https://github.com/InSecurity-Solutions/Shinobi.git
cd Shinobi
sudo bash INSTALL/ubuntu.sh
```
O instalador interativo faz:
- gera `conf.json` (com cron key aleatória) e `super.json`;
- instala Node.js (22), FFmpeg, roda `npm install`, instala PM2;
- pergunta **"Install MariaDB?"** → `y` (defina senha root);
- pergunta **"Database Installation?"** → `y` (roda `sql/user.sql`: cria DB `ccio` + user `majesticflame`);
- pergunta **"Start Shinobi on boot?"** → `y` (`pm2 start camera.js` + `pm2 startup` + `pm2 save`).

### Instalação manual (alternativa, se quiser controle)
```bash
cp conf.sample.json conf.json          # ajustar db, port, videosDir
cp super.sample.json super.json
sudo mysql -u root -p -e "source sql/user.sql"
npm install --unsafe-perm
sudo npm install pm2@latest -g
pm2 start camera.js && pm2 save && pm2 startup
```

## Parte C — conf.json (campos principais)
```jsonc
{
  "port": 8080,                       // porta web
  "videosDir": "__DIR__/videos",      // onde gravar (use caminho absoluto p/ disco dedicado)
  "passwordType": "sha256",
  "db": { "host":"127.0.0.1", "user":"majesticflame", "password":"", "database":"ccio", "port":3306 },
  "mail": { "service":"gmail", "auth": { "user":"...", "pass":"..." } },
  "cron": { "key":"<aleatória>" },
  "pluginKeys": {}
}
```
`super.json` (credencial do Superuser, senha em **MD5**):
```json
[ { "mail":"admin@shinobi.video", "pass":"21232f297a57a5a743894a0e4a801fc3" } ]
```

## Parte D — Primeiro acesso
1. **Superuser:** `http://IP_DA_VM:8080/super` → `admin@shinobi.video` / `admin` → **trocar a senha**.
2. Criar conta **Admin** (só e-mail + senha).
3. Logar como Admin na raiz `/` → criar **API Key** (Menu → API Keys) e anotar o **Group Key** (Account Settings).
4. **Add Monitor** → ONVIF Scanner *ou* manual com **Full URL Path**:
   `rtsp://user:senha@ip_camera:554/caminho_rtsp` (preferir **H.264**). Salvo → fica em Watch-Only.

## ⚠️ Armadilhas (Ubuntu 22.04)
1. **`gcc-8`/`g++-8`:** o `INSTALL/ubuntu.sh` tenta instalá-los; **não existem** no 22.04 e o passo falha — **inofensivo**, o `build-essential` (gcc-11) compila os módulos nativos.
2. **Firewall:** `sudo ufw allow 8080/tcp` (e 443 se usar SSL).
3. **Senha padrão `admin`:** trocar antes de expor a VM.
4. **Fuso horário:** ajustar o da VM (`timedatectl set-timezone America/Sao_Paulo`) p/ timestamps de gravação corretos.

## Manutenção
### PM2
```bash
pm2 list                  # status dos processos
pm2 logs camera           # logs em tempo real
pm2 restart camera        # reiniciar após mudar conf.json/super.json
pm2 flush                 # limpar logs antigos
pm2 restart cron          # tarefas agendadas (se usadas)
```
### Vídeos / retenção
- Diretório default: `/home/Shinobi` (mudar via `videosDir` no `conf.json`, caminho absoluto, e reiniciar).
- Espaço/retenção controlados pelo **Admin** (por conta/monitor) no dashboard.

### Atualizar o core (a partir do upstream)
```bash
cd /home/Shinobi
sh UPDATE.sh          # sobrescreve core, NÃO mexe em conf.json/super.json
pm2 flush && pm2 restart camera && pm2 restart cron
```
> No nosso fluxo de fork, prefira `git fetch upstream` + revisão do diff antes (ver SKILL.md), e dê push no `origin` (GitHub).

## Pendências registradas no DNA (.memory/backlog.md)
- BL-006 — validar `conf.json`/`super.json` contra o schema 2.0.
- BL-007 — boot real do `camera.js` contra banco de teste.
- BL-008 — avaliar mover binários ffmpeg (~75MB) para Git LFS.
