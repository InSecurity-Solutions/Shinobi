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
| BL-011 | Automatizar instalacao/implementacao (Hyper-V + Shinobi) | 🔄 Em andamento | 2026-06-27 | — | VM Shinobi-NeoVigia criada (192.168.1.71); cloud-init instalando; validando :8080 |

---

## Timesheets

| Bloco | Inicio | Fim | Duracao | Itens |
|---|---|---|---|---|

---

## Futuro (ideias)

| ID | Item | Origem |
|---|---|---|
| FT-001 | {ideia} | {origem} |
