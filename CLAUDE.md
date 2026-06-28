# CLAUDE.md — Shinobi
> Briefing obrigatorio. Lido em toda sessao.
> InMinds DNA v1.0.0 | Inicializado em 2026-06-27

---

## Projeto
- **Nome:** Shinobi
- **Stack:** Node.js, Express, EJS, Socket.io, MySQL (knex), FFmpeg, ONVIF, Nodemailer
- **Repo:** https://github.com/InSecurity-Solutions/Shinobi.git
- **Deploy:** Docker (volumes via .env: MYSQL_VOLUME_DIR, VIDEOS_VOLUME_DIR)

## Estrutura
- `camera.js` — core do servidor (CCTV/NVR)
- `cron.js` — tarefas agendadas
- `definitions/` — definicoes de UI/config
- `languages/` — i18n
- `plugins/` — plugins (Motion, OpenCV, OpenALPR)
- `sql/` — schema do banco
- `web/` — frontend
- `tools/` — utilitarios
- `INSTALL/` — scripts de instalacao
- `conf.sample.json` / `super.sample.json` — configs de exemplo

## .memory/
Este projeto usa InMinds DNA para gestao de estado.
- Backlog: `.memory/backlog.md`
- Decisoes: `.memory/decisions.md`
- PRD: `.memory/prd-v1.md`
- Caixa de entrada: `.memory/#temp.md`

## Regras
1. Leia este arquivo antes de qualquer acao
2. Atualize .memory/ a cada sessao relevante
3. Registre decisoes em decisions.md com DT-XXX ou DN-XXX
4. Use #temp.md como caixa de entrada — processe e limpe
5. Nunca sobrescreva .memory/ com dados sem backup

## InMinds DNA
- Versao: 1.0.0
- Instalado em: 2026-06-27
