---
name: shinobi
description: Referência e operação do Shinobi 2.0 — o motor de vídeo CCTV/NVR (fork do NeoVigia). Use SEMPRE que for instalar, configurar, fazer deploy (Hyper-V/Ubuntu), customizar features, mexer na API, gravação/detecção de movimento e objetos, integrações (S3, Backblaze, Google Drive, MQTT, Discord, Telegram, e-mail, webhooks), manutenção (PM2, vídeos, retenção) ou atualizar o fork a partir do upstream GitLab. Tudo em português.
---

# Shinobi — Motor de vídeo do NeoVigia

> Skill de referência em **pt-BR**. O Shinobi é um CCTV/NVR open source em Node.js.
> Este repositório é um **fork** que serve de motor de vídeo do **NeoVigia**.
> Nomes de campos/comandos/endpoints ficam em inglês (como no produto); explicações em português.

## Quando usar esta skill
Acione ao trabalhar em qualquer coisa do Shinobi: subir o serviço, adicionar câmera, ligar detecção, integrar com nuvem/notificações, chamar a API, depurar gravação, ou atualizar o fork.

## O que é cada coisa (mapa rápido)
- **Superuser** — administra o *sistema* (cria Admins, limites, logs). Não tem câmeras. Login em `/super`. Credencial no arquivo `super.json`.
- **Admin** — dono das câmeras, gerencia disco/retenção, cria Sub-Accounts. Login na raiz `/`. Dados no banco SQL.
- **Sub-Account** — usuário limitado criado por um Admin.
- **Monitor** — uma câmera/fonte de vídeo (tem `Monitor ID` e pertence a um `Group Key`).
- **Mode** — `stop` (desligado) · `start` (Watch-Only, só grava em evento) · `record` (gravação contínua). Câmera nova entra em Watch-Only.
- **Region** — zona do quadro onde a detecção de movimento é avaliada.
- **Plugins (detectores)** — TensorFlow, Yolo V3, DeepStack, Facial Recognition (objetos/rostos). Movimento usa detector interno.

## Stack (Shinobi 2.0)
Node.js (18–22) · Express 4 · Socket.io 4 · EJS · **MariaDB/MySQL** (mysql2 + Knex 3) · **FFmpeg** · ONVIF · PM2.
Extras: `@aws-sdk/client-s3`, Backblaze B2, MQTT, Discord.js, Nodemailer, Pushover, Google APIs.
Entrada principal: `camera.js`. Tarefas agendadas: `cron.js`. Config geral: `conf.json`. Superuser: `super.json`.

## Git / fluxo do fork (IMPORTANTE)
```
origin   → github.com/InSecurity-Solutions/Shinobi   (CENTRAL — trabalhar e dar push aqui)
upstream → gitlab.com/Shinobi-Systems/Shinobi         (MONITORAR — push bloqueado)
```
- O dev oficial migrou do GitHub para o **GitLab** em ~2018. Versão atual: **2.0.0**.
- **Não atualizar dependências por conta própria** — deixe o upstream ditar as versões (evita quebra e dor de merge). Correções de segurança não-breaking só depois de validar o boot na VM.
- **Atualizar quando sair versão nova no upstream:**
  ```bash
  git fetch upstream
  git log master..upstream/master --oneline    # revisar o que mudou
  # decidir em conjunto, então:
  git merge upstream/master        # (ou reset --hard, conforme o caso)
  git push origin master
  ```

## Subir o serviço (resumo)
Shinobi é feito pra **Linux**. No Windows, rodar numa **VM Linux (Hyper-V, Ubuntu 22.04)**.
1. VM Ubuntu 22.04 (Hyper-V Gen 2, Secure Boot off, **Virtual Switch Externo** pra ver as câmeras).
2. `git clone https://github.com/InSecurity-Solutions/Shinobi.git && cd Shinobi`
3. `sudo bash INSTALL/ubuntu.sh` (responder `y` para MariaDB, Database e start-on-boot).
4. Acessar **Superuser** em `http://IP_DA_VM:8080/super` (`admin@shinobi.video` / `admin`) → trocar senha → criar API key e Admin → adicionar monitor.

👉 Passo a passo completo + armadilhas: **[deploy-hyperv.md](deploy-hyperv.md)**

## Arquivos de referência
- **[deploy-hyperv.md](deploy-hyperv.md)** — deploy nativo na VM Hyper-V/Ubuntu, requisitos, armadilhas, manutenção (PM2, vídeos, retenção, update).
- **[conceitos-e-integracoes.md](conceitos-e-integracoes.md)** — contas, monitor, detecção de movimento/objetos, filtros de evento, e todas as integrações (e-mail, Discord, Telegram, S3, Backblaze, Google Drive, MQTT, restream HLS).
- **[referencia-api.md](referencia-api.md)** — autenticação, formato das chamadas e endpoints úteis (monitores, triggers, vídeos, eventos, streams, PTZ).

## Regras ao mexer aqui
1. É um fork rastreando upstream — toda mudança nossa fica isolada e commitada no GitHub (`origin`).
2. Mudar `conf.json` de preferência via `node tools/modifyConfiguration.js addToConfig='{...}'` (não editar à mão).
3. Após mudar `conf.json` ou `super.json`: `pm2 restart camera`.
4. Não expor a VM sem trocar a senha padrão `admin`.
5. Fonte oficial: `https://docs.shinobi.video` (em inglês).
