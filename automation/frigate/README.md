# Frigate — piloto NeoVigia (motor FOSS candidato)

NVR + IA de detecção **open source de verdade** (Apache-2.0, livre p/ uso comercial).
Roda na mesma VM do Shinobi, em Docker, atrás do Tailscale.

## Por que avaliar o Frigate
- **Apache-2.0** → grátis inclusive comercial (ao contrário do Shinobi, que cobra p/ comercial).
- IA de detecção de objetos forte (CPU, Coral USB, GPU).
- RTSP/go2rtc nativo, snapshots, gravação por evento, MQTT, API.

## Deploy (na VM)
```bash
# Docker já instalado via get.docker.com
sudo mkdir -p /opt/frigate/config /opt/frigate/media
# copiar docker-compose.yml -> /opt/frigate/ e config.yml -> /opt/frigate/config/
cd /opt/frigate && sudo docker compose up -d
```

## Acesso
- **Web UI:** `http://100.85.135.1:5000` (somente via Tailscale — UFW libera 5000 só na `tailscale0`).
- Portas: 5000 (UI), 8554 (RTSP restream), 8555 (WebRTC).

## Configuração
- `config.yml` — câmeras, detectores, objetos, gravação. Doc: https://docs.frigate.video
- Piloto usa o **celular S23** como câmera de teste (`rtsp://100.87.63.18:8080/...` via app "IP Webcam"), detector **CPU**.
- Produção: trocar pelo RTSP do NVR/HAIZ (via ponte do poste) e usar **Coral USB**/GPU p/ IA.

## Operação
```bash
cd /opt/frigate
sudo docker compose ps           # status
sudo docker compose logs -f      # logs
sudo docker compose restart      # reiniciar
sudo docker compose down         # parar
# editar config.yml e:
sudo docker compose restart
```

## Comparativo (resumo) — ver DNA decisions DT-007
| | Shinobi | Frigate |
|---|---|---|
| Licença | própria (paga p/ comercial) | Apache-2.0 (livre) |
| IA | plugins | nativa, forte |
| Multi-conta | sim | não (single-tenant) |
| Custo comercial | $$ | grátis |
