# Automação — Shinobi NeoVigia (Hyper-V + Ubuntu, touchless)

Provisiona uma VM Hyper-V com Ubuntu 22.04 e instala o **Shinobi 2.0** (motor de
vídeo do NeoVigia) de forma **100% automática** via cloud-init. Um comando no
Windows → Shinobi respondendo em `http://IP:8080`.

> Faz parte da skill `/shinobi`. Para conceitos, API e operação, veja
> `.claude/skills/shinobi/`.

## Como funciona (pipeline)

```
Windows (PowerShell admin)              Dentro da VM (1º boot)
┌──────────────────────────┐           ┌────────────────────────────┐
│ Deploy-ShinobiVM.ps1      │           │ cloud-init (user-data)     │
│ 1. lê config + gera senha │           │  • cria usuário, timezone  │
│ 2. baixa Ubuntu cloud img │  CIDATA   │  • git clone do seu fork   │
│    → converte p/ VHDX     │ ───seed──▶│  • roda install-shinobi.sh │
│ 3. monta seed cloud-init  │           │     - Node, FFmpeg, MariaDB│
│ 4. cria VM Gen2 + switch  │           │     - conf.json/super.json │
│ 5. start + espera IP      │           │     - pm2 + ufw + health   │
└──────────────────────────┘           └────────────────────────────┘
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `Deploy-ShinobiVM.ps1` | Orquestrador (Windows). Cria a VM e o seed cloud-init. |
| `shinobi.config.example.psd1` | Modelo de configuração (copie p/ `shinobi.config.psd1`). |
| `cloud-init/user-data.template` | cloud-init renderizado no seed (placeholders `__X__`). |
| `cloud-init/meta-data.template` | metadados NoCloud. |
| `install-shinobi.sh` | Instalação touchless idempotente (roda na VM). |
| `.gitignore` | Protege segredos, VHDs e cloud-init renderizado. |

## Pré-requisitos (no Windows host)
- Windows 11 com **Hyper-V habilitado**.
- Rodar o PowerShell **como Administrador**.
- ~20 GB livres em `WorkDir` (default `C:\ShinobiVM`) + espaço do disco da VM.

## Uso

```powershell
# 1. Copie e ajuste a config (opcional — os defaults já funcionam)
Copy-Item .\shinobi.config.example.psd1 .\shinobi.config.psd1
notepad .\shinobi.config.psd1

# 2. Rode como Administrador
.\Deploy-ShinobiVM.ps1 -ConfigPath .\shinobi.config.psd1
```

Ao final, o script imprime a URL e salva as senhas geradas em
`.secrets.<VMName>.txt` (que **não** vai pro Git).

### Acompanhar a instalação dentro da VM
```bash
ssh neovigia@<IP>
tail -f /var/log/shinobi-install.log
pm2 logs camera
```

## Config (principais campos)
Veja `shinobi.config.example.psd1`. Destaques:
- `CPUCount` / `MemoryGB` / `DiskGB` — recursos da VM (default 4 / 8 / 128).
- `CreateSwitch` + `SwitchName` — cria switch **externo** (VM enxerga as câmeras).
- `RepoUrl` / `RepoBranch` — seu fork (default GitHub `origin`, `master`).
- `SuperuserEmail` — login do Superuser do Shinobi.
- `GeneratePasswords = $true` — gera senhas fortes (recomendado).
- `SSHPublicKey` — opcional, p/ SSH sem senha.

## Decisões técnicas
- **Imagem:** cloud image oficial Ubuntu 22.04 (Azure VHD) → `Convert-VHD` nativo → VHDX. Já vem com cloud-init + datasource NoCloud → touchless real.
- **Gen2 + Secure Boot OFF:** a cloud image Linux não tem shim assinado pela MS.
- **Seed como VHDX FAT32 `CIDATA`:** dispensa ferramentas de ISO (oscdimg/ADK).
- **Segurança:** senhas geradas em runtime, nunca commitadas; `super.json` nasce com senha forte (nada de `admin/admin`); UFW libera só SSH + 8080.

## Solução de problemas
- **VM não dá boot (Gen2):** o boot UEFI da cloud image falhou. Tente `Generation = 1` na config (fallback), ou use a ISO live-server + autoinstall.
- **Script não pega o IP:** integration services pode não reportar. Abra o console (`vmconnect`) ou veja o lease DHCP no roteador; a instalação continua normalmente.
- **`:8080` não responde:** `pm2 logs camera` e `cat /var/log/shinobi-install.log` dentro da VM.
- **Idempotência:** rodar de novo reaproveita o VHDX já baixado; recriar a VM pede confirmação (`sim`).

## Limitações / próximos passos
- Cadastro automático de câmeras (monitores) via API **não** está incluído (era o escopo "Tudo + config inicial"). Dá pra adicionar um estágio 4 que usa a API (`/configureMonitor`) com a lista de RTSP.
- Validação end-to-end (`:8080` respondendo) será feita na execução assistida.
