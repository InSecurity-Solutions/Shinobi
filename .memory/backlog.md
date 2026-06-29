# Backlog — Shinobi
> Arquivo vivo. Atualizado a cada sessao.
> Ultima atualizacao: 2026-06-27 (migracao 2.0 + centralizacao GitHub)

---

## Convencao
- BL-XXX — Item avulso (sequencial global)
- EF-XXX — Especificacao funcional
- EF-XXX.Y — Sub-item de uma EF

## Status
- ✅ Entregue | 🔄 Em andamento | ⏳ Pendente | ❌ Cancelado | 🚫 Bloqueado

---

## MVP 1

| ID | Item | Status | Inicio | Fim | Notas |
|---|---|---|---|---|---|
| BL-001 | Setup InMinds DNA no projeto | ✅ Entregue | 2026-06-27 | 2026-06-27 | .memory/, .agents/, CLAUDE.md |
| BL-002 | Instalar dependencias do projeto | ✅ Entregue | 2026-06-27 | 2026-06-27 | npm install — node_modules nao existia |
| BL-003 | Migrar fork 1.0.37 -> Shinobi 2.0.0 (GitLab) | ✅ Entregue | 2026-06-27 | 2026-06-27 | re-sync upstream Shinobi-Systems; .env preservado; DT-003 |
| BL-004 | Reinstalar deps na base 2.0 | ✅ Entregue | 2026-06-27 | 2026-06-27 | 513 pacotes; vulnerabilidades 33->11 (0 criticas) |
| BL-005 | Centralizar no GitHub + remote upstream GitLab | ✅ Entregue | 2026-06-27 | 2026-06-27 | force-push master + tags; DT-004 |
| BL-006 | Validar conf/super.json e .env contra schema 2.0 | ⏳ Pendente | — | — | schema mudou entre 1.x e 2.0 |
| BL-007 | Boot real do camera.js contra banco de teste | ⏳ Pendente | — | — | smoke das deps ja OK |
| BL-008 | Avaliar migracao dos binarios ffmpeg p/ Git LFS | ⏳ Pendente | — | — | ffmpeg/ffprobe ~75MB cada no repo |
| BL-009 | Auditar deps + mapear requisitos de deploy | ✅ Entregue | 2026-06-27 | 2026-06-27 | 11 vulns (0 criticas); deploy nativo Ubuntu/Hyper-V |
| BL-010 | Criar skill /shinobi em pt-BR | ✅ Entregue | 2026-06-27 | 2026-06-27 | .claude/skills/shinobi (SKILL + deploy + conceitos + api) |
| BL-011 | Automatizar instalacao/implementacao (Hyper-V + Shinobi) | ✅ Entregue | 2026-06-27 | 2026-06-28 | VM Shinobi-NeoVigia @192.168.1.71 :8080 HTTP200; automation/ versionado; DT-005 |
| BL-012 | Trocar senha padrao do Superuser e revisar exposicao | ⏳ Pendente | — | — | nasce com senha forte gerada; trocar no 1o acesso |
| BL-013 | Cadastro automatico de cameras via API (estagio 4) | ⏳ Pendente | — | — | opcional; precisa lista de RTSP |
| BL-014 | Conectividade Tailscale (Fase 1: VM no tailnet + UFW) | ✅ Entregue | 2026-06-28 | 2026-06-28 | 100.85.135.1; :8080 so via tailnet; DT-006 |
| BL-015 | Fase 2: ponte/edge no poste (cameras) | ⏳ Pendente | — | — | piloto: 1 NVR ICSEE, 2 postes (3+4 cams=7). Poste c/ 12V/USB+LAN livre; uplink 4G ou fibra/radio Claro/Vivo |
| BL-016 | Fase 3: cadastrar canais do NVR no Shinobi (RTSP) | ⏳ Pendente | — | — | sub-stream, Watch-Only + eventos; cams HAIZ + NVR ICSEE (XMEye/iCSee) |
| BL-018 | Especificar Mini NVR ICSEE + cams HAIZ (amanha) | ⏳ Pendente | — | — | RTSP, codec/bitrate, ONDE esta o reconhecimento (cam vs NVR), PoE, storage |
| BL-019 | Definir arquitetura de borda NeoVigia (proprio) | ⏳ Pendente | — | — | edge node substituir NVR? IA na cam/NVR/central? Pi5/OrangePi5 NPU vs Shinobi central |
| BL-017 | API key Shinobi p/ NeoVigia | ⏳ Pendente | — | — | M2M via tailnet |
| BL-020 | Criar conta Admin Shinobi (form bugado) | ✅ Entregue | 2026-06-28 | 2026-06-28 | via DB; op@neovigia.local; DT-008 |
| BL-021 | Avaliar Frigate (FOSS) como motor de producao | 🔄 Em andamento | 2026-06-28 | — | Docker+Frigate na VM; UI :5000 via tailnet; DT-007 |
| BL-022 | Camera de teste (celular) AO VIVO no Frigate | ✅ Entregue | 2026-06-28 | 2026-06-29 | pipeline celular->Tailscale->Frigate->web validado |
| BL-023 | Tuning producao: substream p/ detect + hwaccel/Coral | ⏳ Pendente | — | — | resolve alta CPU do FFmpeg; edge grava hi-res |

---

## Timesheets

| Bloco | Inicio | Fim | Duracao | Itens |
|---|---|---|---|---|

---

## Futuro (ideias)

| ID | Item | Origem |
|---|---|---|
| FT-001 | {ideia} | {origem} |
