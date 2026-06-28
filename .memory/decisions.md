# Decisoes — Shinobi
> Arquivo vivo. Registra decisoes com justificativa.
> Ultima atualizacao: 2026-06-27 (migracao 2.0 + centralizacao GitHub)

---

## Formato
- **O que:** o que foi decidido
- **Por que:** justificativa / contexto
- **Quando:** data
- **Alternativas descartadas:** o que foi considerado e rejeitado

---

## Decisoes Tecnicas

### DT-001 — Stack do projeto (atualizada para 2.0)
- **O que:** Stack do Shinobi 2.0: Node.js + Express 4 + EJS + Socket.io 4 + MySQL/mysql2 + Knex 3 + FFmpeg + ONVIF + Nodemailer, com S3 (@aws-sdk/client-s3), Backblaze B2, MQTT, Discord.js e Pushover
- **Por que:** Apos migracao do fork antigo (1.0.37) para a base atual do upstream (2.0.0)
- **Quando:** 2026-06-27
- **Alternativas descartadas:** Manter a stack 1.x (socket.io 1.x, knex 0.14) — descartada por estar abandonada e com 8 vulnerabilidades criticas

### DT-002 — Deploy via Docker
- **O que:** Deploy/execucao baseado em Docker com volumes para MySQL e videos (.env)
- **Por que:** Detectado pelas env vars MYSQL_VOLUME_DIR / VIDEOS_VOLUME_DIR
- **Quando:** 2026-06-27
- **Alternativas descartadas:** —

### DT-003 — Migracao do fork 1.x (GitHub) para o Shinobi 2.0 (GitLab)
- **O que:** O fork estava preso na versao 1.0.37 (ultimo commit do upstream no GitHub era o aviso "We moved to GitLab"). Re-sincronizado para a base 2.0.0 do upstream real em gitlab.com/Shinobi-Systems/Shinobi (commit 9ddc2c3c, master). node_modules reinstalado do zero (513 pacotes). .env do NeoVigia preservado via backup (.env.neovigia.bak).
- **Por que:** O desenvolvimento migrou para o GitLab em ~2018; o GitHub upstream esta congelado. A 2.0 traz socket.io 4, knex 3, mysql2, shinobi-mp4frag e reduz vulnerabilidades de 33 (8 criticas) para 11 (0 criticas).
- **Quando:** 2026-06-27
- **Alternativas descartadas:** (a) Atualizar so as deps na base 1.x — quebraria por APIs incompativeis; (b) Clone limpo ao lado — desnecessario, o re-sync via git preservou historico e customizacoes.

### DT-004 — Centralizacao no GitHub + monitoramento do GitLab
- **O que:** GitHub (github.com/InSecurity-Solutions/Shinobi) e o repo CENTRAL de trabalho (remote `origin`). O upstream GitLab Shinobi-Systems e remote `upstream` somente-fetch (push bloqueado). master (4.100 commits) + 6 tags enviados ao GitHub via force-push.
- **Por que:** Centralizar o trabalho num so lugar (GitHub) e monitorar o upstream para novas versoes, decidindo as atualizacoes em conjunto antes de aplicar.
- **Quando:** 2026-06-27
- **Alternativas descartadas:** (a) Usar o fork pessoal do GitLab (insecurity-solutions/Shinobi) como central — redundante; (b) Mirror completo (~100 branches) no GitHub — poluiria o repo com branches de WIP. Optado por master + tags.
- **Fluxo de atualizacao:** `git fetch upstream` -> revisar `git log master..upstream/master --oneline` -> decidir junto -> merge/reset -> `git push origin master`.

---

## Decisoes de Negocio

### DN-001 — Shinobi como motor de video do NeoVigia
- **O que:** Este fork do Shinobi 2.0 sera o motor de video (CCTV/NVR) do produto NeoVigia
- **Por que:** Reaproveitar solucao open-source madura de gravacao/streaming de cameras IP (ONVIF/RTSP/RTMP) em vez de construir do zero
- **Quando:** 2026-06-27
