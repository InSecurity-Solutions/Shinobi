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

### DT-005 — Imagem Ubuntu e correcao do cloud-init no Hyper-V
- **O que:** A automacao usa a cloud image Ubuntu 22.04 "Azure VHD" (unica em formato VHD; convertida p/ VHDX via Convert-VHD nativo). Essa imagem fixa `datasource_list: [ Azure ]` e, no Hyper-V, ignora o seed NoCloud -> cloud-init trava em init-local (datasource=null), nao cria usuario, nao gera host keys, nao roda o install. Correcao: patch offline (montando o VHDX via WSL ext4) escrevendo `/etc/cloud/cloud.cfg.d/99-nocloud.cfg` com `datasource_list: [ NoCloud, None ]` e limpando `/var/lib/cloud/*`. Implementado na funcao Invoke-NoCloudPatch do Deploy-ShinobiVM.ps1.
- **Por que:** Era a unica imagem VHD oficial (evita dependencia de qemu-img p/ converter o qcow2 generico). O patch torna o touchless confiavel no Hyper-V.
- **Quando:** 2026-06-28
- **Alternativas descartadas:** (a) imagem generica qcow2 -> exigiria qemu-img (tooling extra); (b) ISO live-server + autoinstall -> exigiria repack de grub (oscdimg/ADK).
- **Outras correcoes da automacao:** o `.vhd` extraido do tar vem sparse+comprimido (Convert-VHD recusa, 0xC03A001A) -> materializado via copia FileStream; `.gitattributes` forca LF nos `.sh` (senao quebram no Linux com `\r`).

### DT-006 — Conectividade site-remoto e acesso externo via Tailscale (overlay)
- **O que:** Cameras+mini-NVR ficam num site remoto; o Shinobi roda no site central. Conexao por **Tailscale** (overlay WireGuard, fura CGNAT, sem port-forward). VM Shinobi no tailnet em **100.85.135.1** (IP estavel, imune ao DHCP da LAN). UFW travado: `:8080` so via interface `tailscale0` (LAN/WAN bloqueados — comprovado). Device no site remoto sera **subnet-router** anunciando a subnet das cameras (script automation/remote-subnet-router.sh); a VM ja esta com `--accept-routes` (RouteAll=true). NeoVigia consumira a API do Shinobi pelo tailnet (privado + API key).
- **Por que:** Acesso e M2M (NeoVigia->API), nao precisa nada publico. Gravacao fica no edge (mini-NVR), Shinobi faz live view+eventos (banda baixa). Resultado: superficie de ataque ~zero.
- **Quando:** 2026-06-28
- **Alternativas descartadas:** RTSP/`:8080` expostos na internet (inseguro); WireGuard puro (precisa IP publico/port-forward, ruim com CGNAT); Headscale self-hosted (mais setup — pode ser adotado depois p/ soberania).
- **Pendente:** API key do Shinobi p/ NeoVigia; reserva DHCP/IP estatico na LAN (follow-up, ja mitigado pelo IP de tailnet); opcional travar SSH so no tailnet.

---

## Decisoes de Negocio

### DN-001 — Shinobi como motor de video do NeoVigia
- **O que:** Este fork do Shinobi 2.0 sera o motor de video (CCTV/NVR) do produto NeoVigia
- **Por que:** Reaproveitar solucao open-source madura de gravacao/streaming de cameras IP (ONVIF/RTSP/RTMP) em vez de construir do zero
- **Quando:** 2026-06-27
