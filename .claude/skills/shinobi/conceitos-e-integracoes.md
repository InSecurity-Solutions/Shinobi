# Conceitos, detecção e integrações

## Contas
| Tipo | O que faz | Login | Onde fica |
|---|---|---|---|
| **Superuser** | Administra o sistema (cria Admins, limites, logs). Não tem câmeras. | `/super` | arquivo `super.json` |
| **Admin** | Dono das câmeras; gerencia disco/retenção; cria Sub-Accounts. | `/` (raiz) | banco SQL |
| **Sub-Account** | Usuário limitado (pode ser restrito de deletar vídeo, ver câmeras, criar). | dashboard | banco SQL |

## Monitor e Mode
- **Monitor** = câmera/fonte (tem `Monitor ID`, pertence a um `Group Key`).
- **Mode**: `stop` (desligado) · `start` (Watch-Only) · `record` (contínuo). Câmera nova entra em Watch-Only.
- Adicionar câmera: **ONVIF Scanner** (auto) ou manual via **Full URL Path** (`rtsp://user:pass@ip:554/path`). Stream recomendado: **H.264** (também aceita H.265, MJPEG, USB/local).

## Detecção de MOVIMENTO (`/detect/motion`)
Ativar em **Monitor Settings → Detector Settings → Enabled = Yes**.
- **Save Events** — grava eventos no banco (aparecem no playback).
- **Trigger Record** — inicia gravação ao detectar (quando em Watch-Only).
- **Buffer Time from Event** — segundos gravados ANTES da detecção.
- **Recording Timeout** — duração (min) da gravação por evento.
- **Timeout Reset on Next Event** — reinicia timeout a cada novo movimento.

**Region/Zone Settings:**
- **Minimum Change / Maximum Change** — limiares (confiança mín/máx p/ disparar).
- **Full Frame** — analisa o quadro inteiro.
- **Accuracy Mode** — divide a região em tiles (mais preciso).
- **Trigger Threshold** — nº de quadros sucessivos antes de disparar.
- **Color Threshold** — sensibilidade de diferença de pixel RGBA (default `9`, faixa 1–255).

## Detecção de OBJETOS (`/detect/object`)
1. Conectar/instalar um detector plugin: **TensorFlow** (`tensorflow`), **Yolo V3** (`yolo`), **DeepStack** (`deepstack-object`), **Facial Recognition** (`face`). (OpenCV/OpenALPR não estão na doc atual.)
2. **Monitor Settings → Object Detection → ativar**. O monitor precisa estar em **Watch-Only** para gravar ao detectar objeto.
- **Buffer Time from Event** (default 5s) · **Recording Timeout** (default 0.5 min).

## Filtros de evento (`/detect/event-filters`)
Selecionam quais eventos importam.
- Condição por **Object Tag** com operadores (ex.: **Does Not Contain**), várias linhas para lógica composta.
- Ação documentada: **Drop Event = Yes** (descarta o que casa). Outras ações (webhook/comando) não documentadas.
- Outros gatilhos: **ONVIF Event Triggering**, **FTP-based**, **SMTP-based**, **MQTT** (abaixo).

## Integrações — Notificações
**E-mail** (`conf.json` → bloco `mail`, usa Nodemailer):
```json
"mail": { "service":"gmail", "auth": { "user":"...", "pass":"app_password" } }
```
Ativar **Notifications** por monitor. Gmail c/ 2FA exige App Specific Password.

**Discord:**
```bash
npm install discord.js
node tools/modifyConfiguration.js addToConfig='{"discordBot":true}'
pm2 restart camera
```
Credenciais (Account Settings): **Bot Token** + **Channel ID**. Ativar em Monitor → Notifications.

**Telegram:**
```bash
npm install node-telegram-bot-api
node tools/modifyConfiguration.js addToConfig='{"telegramBot":true}'
pm2 restart camera
```
Credenciais: **Bot Token** (BotFather) + **Recipient ID**.

**Webhooks:** via **hookTester** na API (`/[API KEY]/hookTester/[GROUP KEY]/[MONITOR ID]`); página dedicada não documentada.

## Integrações — Upload para nuvem (`/backup-migration`)
- **Amazon S3** — Settings → seção Amazon S3: **Access Key ID**, **Secret Access Key**, **Bucket Name**, **Region**, **Save Directory**; opções **Autosave** e **Save Links to Database**.
- **Backblaze B2** — página dedicada (suportado).
- **Google Drive** — seção Google Drive: **OAuth Credentials** (cola `credentials.json`), **Get Code**, **OAuth Code**.
- FTP/SFTP como destino de upload: **não documentado** (FTP só como gatilho de entrada).

## Integração — MQTT (`/detect/mqtt`)
```bash
npm install mqtt@2.18.8
node tools/modifyConfiguration.js addToConfig='{"mqttClient":true}'
pm2 restart camera
```
- **Inbound** (Account Settings): **Host**, **MQTT Subscription Key** (tópico), **Type** (Plain ou Frigate `frigate/events`), **Monitors**.
- **Outbound**: **Host**, **MQTT Subscription Key**, **Message From**, **Monitors**.

## Restream / HLS
Endpoints de stream (ver referencia-api.md): **HLS** (`/hls/.../s.m3u8`), **FLV**, **MJPEG**, **MP4 (Poseidon)**. Tipo definido em Monitor Settings. Embedding: `/api/embedding-streams`. TV Channels (multi-câmera): `/[API KEY]/tvChannels/[GROUP KEY]`.
