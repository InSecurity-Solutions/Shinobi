# Referência da API

> Fonte: `https://docs.shinobi.video/api/...`. Variáveis: `[API KEY]` (token criado na UI), `[GROUP KEY]` (Account Settings), `[MONITOR ID]`.

## Autenticação
**1) API Key no path** (RESTful, maioria dos endpoints):
```
http://HOST:8080/[API KEY]/<recurso>/[GROUP KEY]/[MONITOR ID]
```
Padrão: `/:auth/<recurso>/:group/:monitorId`.

**2) Login HTTP** (`/api/authentication`): POST em `http://HOST:8080/?json=true` com `{mail, pass, machineID, function:"dash"}` (opcional `ke` = Group Key). 2FA: `id` + `factorAuthKey`.

**Gerar token:** UI → Menu → **API Keys** → escolher Permissions → Add. IP pode ser `0.0.0.0` (qualquer). Gestão via API: `/api/managing-api-keys-api`.

## Monitores
**Listar:**
```
GET /[API KEY]/monitor/[GROUP KEY]                 # todos
GET /[API KEY]/monitor/[GROUP KEY]/[MONITOR ID]    # um
```
**Ligar/desligar/mudar modo** (`/api/monitor-triggers`):
```
GET /[API KEY]/monitor/[GROUP KEY]/[MONITOR ID]/[MODE]
    # MODE = stop | start | record
GET /[API KEY]/monitor/[GROUP KEY]/[MONITOR ID]/[MODE]/[TIME]/[TIME_INTERVAL]
    # mudança temporária; TIME_INTERVAL = min|minute|minutes|hr|hour|hours|day|days
```
**Adicionar/editar/deletar** (`/api/add-edit-or-delete-a-monitor`):
```
POST /[API KEY]/configureMonitor/[GROUP KEY]/[MONITOR ID]/[ACTION]?data={"mid":...}
    # ACTION = delete (remover) ou omitido (add/edit). ID existente = edita.
    # exemplo de payload: https://cdn.shinobi.video/configs/CameraReolink.json
```

## Disparar detecção externa
```
GET /[API KEY]/motion/[GROUP KEY]/[MONITOR ID]?data={JSON}
```

## PTZ (controle de câmera)
```
GET /[API KEY]/control/[GROUP KEY]/[MONITOR ID]/[ACTION]
    # ACTION = center|up|down|left|right|zoom_in|zoom_out|enable_nv|disable_nv
```

## Vídeos
```
GET /[API KEY]/videos/[GROUP KEY]
GET /[API KEY]/videos/[GROUP KEY]/[MONITOR ID]
    ?start=YYYY-MM-DDTHH:mm:ss&end=YYYY-MM-DDTHH:mm:ss
    &startOperator=>=&endOperator=<=&endIsStartTo
    # 'videos' ↔ 'cloudVideos' (S3/Backblaze)
```

## Eventos de detecção
```
GET /[API KEY]/events/[GROUP KEY]
GET /[API KEY]/events/[GROUP KEY]/[MONITOR ID]?start=...&end=...&startOperator=>=&endOperator=<=
```

## Streams (restream)
```
/[API KEY]/mjpeg/[GROUP KEY]/[MONITOR ID]
/[API KEY]/hls/[GROUP KEY]/[MONITOR ID]/s.m3u8
/[API KEY]/flv/[GROUP KEY]/[MONITOR ID]/s.flv
/[API KEY]/mp4/[GROUP KEY]/[MONITOR ID]/s.mp4
/[API KEY]/mp4/[GROUP KEY]/[MONITOR ID]/[CHANNEL]/s.mp4   # substream
```

## Outros (índice)
`/api/get-timelapse` · `/api/get-fileBin` · `/api/alarms` · `/api/custom-settings` · `/api/modifying-a-video-or-deleting-it` · `/api/superuser-only` · `/api/administrator-only` · `/api/system-triggers` · `/api/embedding-streams` · `hookTester` (`/[API KEY]/hookTester/[GROUP KEY]/[MONITOR ID]`) · TV Channels (`/[API KEY]/tvChannels/[GROUP KEY]`).

## Lacunas conhecidas (não documentado)
- Lista completa de campos do `conf.json` numa página única (ver `conf.sample.json`).
- Campos granulares do formulário de Monitor (Input/Connection Type, Host/Port/Path separados) — a doc usa **Full URL Path**.
- Confidence threshold em Object Detection.
- Ações de Event Filter além de **Drop Event**.
