# .memory — Shinobi
> Fonte unica de verdade do estado do projeto.
> InMinds DNA v1.0.0 | Inicializado em 2026-06-27

---

## Projeto
- **Nome:** Shinobi
- **Stack:** Node.js, Express, EJS, Socket.io, MySQL (knex), FFmpeg, ONVIF, Nodemailer
- **Repo:** https://github.com/InSecurity-Solutions/Shinobi.git
- **Deploy:** Docker (volumes via .env: MYSQL_VOLUME_DIR, VIDEOS_VOLUME_DIR)

## Regras
1. Arquivos aqui sao a verdade oficial
2. #temp.md e caixa de entrada — nunca e referencia
3. Datas sempre absolutas (nunca "semana que vem")
4. Um item, um lugar — nao duplicar entre arquivos
5. Historicos nao se editam — snapshots congelados
6. .memory/ com dados NUNCA e sobrescrito por atualizacoes

## Tipos de arquivo

| Tipo | Descricao | Quem edita | Frequencia |
|---|---|---|---|
| Vivo | Estado atual | Code | A cada sessao |
| Referencia | Documento base | Code (nova versao) | Raramente |
| Historico | Snapshot congelado | Ninguem | Nunca |
| Transicao | Temporario (#temp) | Usuario cola, Code processa | Sob demanda |
| Assets | Visuais promovidos | Code | Sob demanda |

## Indice

| Arquivo | Tipo | Descricao |
|---|---|---|
| README.md | Manifesto | Este arquivo |
| #temp.md | Transicao | Caixa de entrada |
| backlog.md | Vivo | Backlog unificado |
| decisions.md | Vivo | Decisoes com justificativa |
| prd-v1.md | Referencia | PRD do projeto |
| arquitetura-neovigia.md | Referencia | Arquitetura multi-tenant (broker + entitlements) sobre engine headless |

## Workflow de entrada
1. Conteudo chega (reuniao, chat, Slack, outra IA)
2. Usuario cola no #temp.md
3. Code le, identifica destino, faz merge no arquivo certo
4. Code limpa #temp.md e confirma o que processou

## InMinds DNA
- Versao: 1.0.0
- Instalado em: 2026-06-27
- Skills globais: inm-per-claudin, inm-rol-cto, inm-rol-vendas, inm-plb-comercial, inm-plb-operacional, inm-prd-econet, inm-sec-predeploy, inm-utl-setup, inm-utl-skills, inm-utl-ss, inm-dna-setup, inm-dna-skill-creator
