# Arquitetura NeoVigia — Plataforma de monitoramento como serviço
> Tipo: Referência · Criado: 2026-06-28
> Premissa central: o modelo comercial multi-tenant é da APLICAÇÃO NeoVigia, NÃO do engine de vídeo.

## Princípio: separação de camadas
O engine de vídeo (Frigate/Shinobi) é **commodity headless** — entra RTSP, sai stream + eventos via API. **Todo o negócio (identidade, ACL, trial, cobrança, UI) vive no NeoVigia.** É onde está o IP/valor.

```
CLIENTE (app NeoVigia, design system InSecurity|NeoVigia)
   │  só fala com a NeoVigia (nunca com o engine)
   ▼
BACKEND NeoVigia
   • Identidade: Grupo → Casa → Usuário
   • Entitlements/ACL: quem vê qual câmera (com validade)
   • Avulso / Promo / Trial
   • Cobrança + CRM
   • BROKER de stream (autoriza e entrega o vídeo)
   │  API/streams (privado, Tailscale)
   ▼
ENGINE(s) DE VÍDEO headless  →  Frigate (FOSS) por site/edge
   ingest RTSP · grava · IA · entrega stream/eventos
```

## Modelo de dados (esboço)
- **Grupo** (ex.: uma rua/condomínio): id, nome, dono(owner_user), regras.
- **Casa** (unidade dentro do Grupo): id, grupo_id, nome, qtd_acessos (ex.: 10).
- **Usuário**: id, dados, vínculo (grupo/casa) ou avulso.
- **Câmera**: id, poste/site, engine_ref (qual Frigate + nome da câmera), metadados.
- **Entitlement (acesso)**: usuario_id, camera_id(s), origem(`grupo`|`casa`|`avulso`|`promo`), inicio, **expira_em** (null=permanente), status.
- **Assinatura/Cobrança**: plano, itens (câmeras), ciclo, integração CRM.

Mapa dos casos do cliente:
- **Grupo→Casa→Acessos:** dono do Grupo distribui entitlements às Casas/usuários conforme regras.
- **Avulso:** usuário compra entitlement de N câmeras pelo app.
- **Promo/Trial:** entitlement com `expira_em` (ex.: +7 dias) → broker corta ao expirar.

## Broker de stream (coração técnico)
1. App pede a câmera X → backend valida login + entitlement (ativo e não expirado).
2. Se ok, emite acesso **efêmero**: URL HLS assinada / sessão WebRTC com token curto.
3. Cliente recebe só o stream autorizado; **nunca** o RTSP cru nem acesso ao engine.
4. Implementação possível: reverse proxy/gateway que valida JWT/entitlement por request; go2rtc/MediaMTX p/ restream; tokens com TTL.

## Engine: responsabilidades (e por que Frigate)
- Ingest RTSP, gravação por evento, **IA de detecção** (objetos/pessoa/veículo), snapshots.
- Expõe: HTTP API, RTSP/WebRTC/HLS (go2rtc), eventos via **MQTT**.
- **Frigate (Apache-2.0)** escolhido: livre p/ comercial, headless, API/MQTT/WebRTC nativos. Shinobi serviria, mas cobra p/ comercial e seu multi-account não cobre o modelo (sem Casa/trial/cobrança).

## Escala
- Vários **Frigate por site/edge** (poste/região); o backend NeoVigia agrega todos.
- O broker e o modelo de entitlement escalam horizontalmente (stateless + DB).
- Infra já pronta (engine-agnóstica): VM, **Tailscale**, UFW, ponte de borda no poste.

## UI/UX
- Cliente usa o **app próprio NeoVigia** (web/mobile) com o design system InSecurity|NeoVigia — controle total.
- A UI do engine (Frigate :5000 / Shinobi :8080) fica **só p/ operação interna**, não exposta ao cliente.

## Próximos passos de arquitetura
- [ ] Definir o broker (gateway de stream + emissão de token/URL assinada).
- [ ] Modelar o schema (Grupo/Casa/Usuário/Câmera/Entitlement/Cobrança) + integração CRM.
- [ ] Definir como o backend referencia câmeras em N instâncias Frigate (engine_ref).
- [ ] Protótipo: 1 câmera no Frigate → broker → app NeoVigia exibindo com entitlement+expiração.
