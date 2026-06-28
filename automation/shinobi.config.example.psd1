@{
    # ===== VM =====
    VMName       = 'Shinobi-NeoVigia'
    Generation   = 2                 # Gen2 (UEFI). Fallback p/ 1 se o boot UEFI falhar.
    CPUCount     = 4
    MemoryGB     = 8
    DiskGB       = 128               # disco da VM (cloud-init faz growpart no 1o boot)

    # ===== Rede =====
    CreateSwitch = $true             # criar Virtual Switch externo
    SwitchName   = 'Shinobi-External'
    # Adapter fisico p/ o switch externo. Vazio = detecta a NIC ativa automaticamente.
    PhysicalAdapterName = ''

    # ===== Repositorio (seu fork) =====
    RepoUrl      = 'https://github.com/InSecurity-Solutions/Shinobi.git'
    RepoBranch   = 'master'
    InstallDir   = '/home/Shinobi'   # diretorio do Shinobi dentro da VM

    # ===== Sistema operacional (VM) =====
    OSUsername   = 'neovigia'
    Timezone     = 'America/Sao_Paulo'
    # Cole sua chave SSH publica aqui p/ acesso sem senha (opcional).
    SSHPublicKey = ''

    # ===== Banco de dados (deve casar com sql/user.sql) =====
    DbName       = 'ccio'
    DbUser       = 'majesticflame'
    DbPassword   = ''                # vazio = padrao do sql/user.sql

    # ===== Shinobi Superuser =====
    SuperuserEmail = 'admin@neovigia.local'

    # ===== Imagem Ubuntu / area de trabalho no Windows =====
    WorkDir      = 'C:\ShinobiVM'
    UbuntuVhdUrl = 'https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64-azure.vhd.tar.gz'

    # ===== Seguranca =====
    # $true  = o script GERA senhas fortes (Superuser + usuario Linux) e salva em
    #          automation/.secrets.<VMName>.txt (gitignored).
    # $false = usa as senhas definidas em GeneratedSuperuserPassword / GeneratedOSPassword.
    GeneratePasswords = $true
    GeneratedSuperuserPassword = ''
    GeneratedOSPassword        = ''
}
