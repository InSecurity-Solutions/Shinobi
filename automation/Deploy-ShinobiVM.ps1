#Requires -RunAsAdministrator
#Requires -Modules Hyper-V
<#
.SYNOPSIS
    Provisiona uma VM Hyper-V (Ubuntu 22.04) e instala o Shinobi 2.0 (motor de
    video do NeoVigia) de forma 100% touchless via cloud-init.

.DESCRIPTION
    Pipeline:
      1) Le a config (.psd1) e gera senhas fortes.
      2) Baixa a cloud image do Ubuntu (Azure VHD), converte p/ VHDX e redimensiona.
      3) Monta um seed CIDATA (cloud-init NoCloud) com user-data/meta-data.
      4) Cria a VM Gen2, switch externo, desabilita Secure Boot e inicia.
      5) Aguarda o IP e imprime URL + credenciais.

.EXAMPLE
    # Como Administrador:
    Copy-Item .\shinobi.config.example.psd1 .\shinobi.config.psd1
    .\Deploy-ShinobiVM.ps1 -ConfigPath .\shinobi.config.psd1
#>
[CmdletBinding()]
param(
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($m){ Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }

# A cloud image -azure fixa 'datasource_list: [ Azure ]' e ignora o seed NoCloud no
# Hyper-V (cloud-init trava em init-local, datasource=null). Patch offline via WSL:
# forca NoCloud e limpa o estado, antes do 1o boot. Idempotente.
function Invoke-NoCloudPatch($vhdx){
    if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
        Write-Warn2 "WSL ausente: nao apliquei o patch NoCloud. A imagem -azure pode ignorar o seed."
        return
    }
    wsl --mount --vhd "$vhdx" --partition 1 2>&1 | Out-Null
    try {
        $mp = (wsl -e sh -c "for d in /mnt/wsl/* /mnt/host/wsl/*; do [ -f `$d/etc/cloud/cloud.cfg ] && { echo `$d; break; }; done" 2>$null | Out-String).Trim()
        if (-not $mp) { Write-Warn2 "Nao localizei o mountpoint do cloud-init no WSL."; return }
        $already = (wsl -e sh -c "test -f $mp/etc/cloud/cloud.cfg.d/99-nocloud.cfg && echo yes" 2>$null | Out-String).Trim()
        if ($already -eq 'yes') { Write-Ok "datasource NoCloud ja configurado (idempotente)"; return }
        wsl -e sh -c "printf 'datasource_list: [ NoCloud, None ]\n' > $mp/etc/cloud/cloud.cfg.d/99-nocloud.cfg; rm -rf $mp/var/lib/cloud/*" 2>$null | Out-Null
        Write-Ok "cloud-init forcado p/ NoCloud (offline) + estado limpo"
    } finally {
        wsl --unmount "$vhdx" 2>&1 | Out-Null
    }
}

# ---------------------------------------------------------------------------
# 0. Config
# ---------------------------------------------------------------------------
if (-not $ConfigPath) {
    $ConfigPath = Join-Path $root 'shinobi.config.psd1'
    if (-not (Test-Path $ConfigPath)) { $ConfigPath = Join-Path $root 'shinobi.config.example.psd1' }
}
Write-Step "Lendo config: $ConfigPath"
$cfg = Import-PowerShellDataFile -Path $ConfigPath
Write-Ok "VM '$($cfg.VMName)' | $($cfg.CPUCount) vCPU | $($cfg.MemoryGB) GB | $($cfg.DiskGB) GB disco"

$work = $cfg.WorkDir
New-Item -ItemType Directory -Force -Path $work | Out-Null

# ---------------------------------------------------------------------------
# 1. Preflight
# ---------------------------------------------------------------------------
Write-Step "Preflight"
# Checagem funcional (mais confiavel que Get-WindowsOptionalFeature/DISM, que pode
# falhar com 'Classe nao registrada' em alguns ambientes mesmo com Hyper-V ativo).
try { Get-VMSwitch -ErrorAction Stop | Out-Null; Write-Ok "Hyper-V operacional" }
catch { throw "Hyper-V nao operacional ($($_.Exception.Message)). Habilite com: Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All" }
$free = (Get-PSDrive -Name ($work.Substring(0,1))).Free
if ($free -lt 20GB) { Write-Warn2 "Pouco espaco livre em $work ($([math]::Round($free/1GB,1)) GB). Recomendado >20GB livres." } else { Write-Ok "Espaco em disco suficiente" }

# ---------------------------------------------------------------------------
# 2. Senhas / segredos
# ---------------------------------------------------------------------------
function New-StrongPassword([int]$len=20){
    $chars = (48..57)+(65..90)+(97..122) | ForEach-Object { [char]$_ }
    -join (1..$len | ForEach-Object { $chars | Get-Random })
}
function Get-Md5Hex([string]$s){
    $md5 = [System.Security.Cryptography.MD5]::Create()
    ($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s)) | ForEach-Object { $_.ToString('x2') }) -join ''
}
Write-Step "Credenciais"
if ($cfg.GeneratePasswords) {
    $superPass = New-StrongPassword 20
    $osPass    = New-StrongPassword 20
    Write-Ok "Senhas fortes geradas"
} else {
    $superPass = $cfg.GeneratedSuperuserPassword
    $osPass    = $cfg.GeneratedOSPassword
    if (-not $superPass -or -not $osPass) { throw "GeneratePasswords=`$false exige GeneratedSuperuserPassword e GeneratedOSPassword preenchidos." }
}
$superMd5 = Get-Md5Hex $superPass
$secretsFile = Join-Path $root ".secrets.$($cfg.VMName).txt"
@"
Shinobi NeoVigia - segredos gerados em $(Get-Date -Format 'yyyy-MM-dd HH:mm')
VM: $($cfg.VMName)
--- Superuser Shinobi (http://<IP>:8080/super) ---
email: $($cfg.SuperuserEmail)
senha: $superPass
md5  : $superMd5
--- Usuario Linux (SSH/console) ---
user : $($cfg.OSUsername)
senha: $osPass
"@ | Set-Content -Path $secretsFile -Encoding UTF8
Write-Ok "Segredos salvos em $secretsFile (gitignored)"

# ---------------------------------------------------------------------------
# 3. Imagem Ubuntu -> VHDX
# ---------------------------------------------------------------------------
Write-Step "Imagem Ubuntu (cloud image)"
$tarball = Join-Path $work 'ubuntu-azure.vhd.tar.gz'
$osVhdx  = Join-Path $work "$($cfg.VMName)-os.vhdx"
if (-not (Test-Path $osVhdx)) {
    if (-not (Test-Path $tarball)) {
        Write-Host "  Baixando $($cfg.UbuntuVhdUrl) ..."
        try { Start-BitsTransfer -Source $cfg.UbuntuVhdUrl -Destination $tarball }
        catch { Invoke-WebRequest -Uri $cfg.UbuntuVhdUrl -OutFile $tarball -UseBasicParsing }
    }
    Write-Host "  Extraindo tarball ..."
    tar -xzf $tarball -C $work
    $srcVhd = Get-ChildItem -Path $work -Filter '*.vhd' -Recurse | Select-Object -First 1
    if (-not $srcVhd) { throw "Nenhum .vhd encontrado apos extrair $tarball" }
    # O tar do Windows extrai o .vhd como SPARSE+COMPRIMIDO; Convert-VHD recusa (0xC03A001A).
    # Materializa um .vhd limpo (nao-sparse, nao-comprimido) via copia FileStream.
    Write-Host "  Normalizando VHD (removendo sparse/compressao) ..."
    $flat = Join-Path $work 'os-flat.vhd'
    if (Test-Path $flat) { Remove-Item $flat -Force }
    $in = [System.IO.File]::OpenRead($srcVhd.FullName)
    $out = [System.IO.File]::Create($flat)
    try { $in.CopyTo($out, 4MB) } finally { $out.Dispose(); $in.Dispose() }
    & fsutil sparse setflag $flat 0 2>$null | Out-Null
    Remove-Item $srcVhd.FullName -Force -ErrorAction SilentlyContinue
    Write-Host "  Convertendo -> VHDX dinamico ..."
    Convert-VHD -Path $flat -DestinationPath $osVhdx -VHDType Dynamic
    Remove-Item $flat -Force -ErrorAction SilentlyContinue
    Write-Host "  Redimensionando disco p/ $($cfg.DiskGB) GB ..."
    Resize-VHD -Path $osVhdx -SizeBytes ($cfg.DiskGB * 1GB)
    Write-Ok "Disco do SO pronto: $osVhdx"
} else {
    Write-Ok "VHDX do SO ja existe: $osVhdx (reuso)"
}

# ---------------------------------------------------------------------------
# 4. Seed cloud-init (CIDATA)
# ---------------------------------------------------------------------------
Write-Step "Gerando seed cloud-init (NoCloud / CIDATA)"
$hostName = ($cfg.VMName.ToLower() -replace '[^a-z0-9-]','-')
# render user-data
$ud = Get-Content (Join-Path $root 'cloud-init\user-data.template') -Raw
if ($cfg.SSHPublicKey) { $sshBlock = "      - $($cfg.SSHPublicKey)" } else { $sshBlock = "      []" }
$ud = $ud.Replace('__HOSTNAME__',$hostName).
          Replace('__TIMEZONE__',$cfg.Timezone).
          Replace('__OSUSER__',$cfg.OSUsername).
          Replace('__SSHKEYS__',$sshBlock).
          Replace('__OSPASS__',$osPass).
          Replace('__INSTALLDIR__',$cfg.InstallDir).
          Replace('__REPO__',$cfg.RepoUrl).
          Replace('__BRANCH__',$cfg.RepoBranch).
          Replace('__SUPEREMAIL__',$cfg.SuperuserEmail).
          Replace('__SUPERMD5__',$superMd5).
          Replace('__DBNAME__',$cfg.DbName).
          Replace('__DBUSER__',$cfg.DbUser).
          Replace('__DBPASS__',$cfg.DbPassword)
# render meta-data
$md = Get-Content (Join-Path $root 'cloud-init\meta-data.template') -Raw
$md = $md.Replace('__INSTANCEID__',"iid-$hostName-$(Get-Random)").Replace('__HOSTNAME__',$hostName)

$seedVhdx = Join-Path $work "$($cfg.VMName)-seed.vhdx"
if (Test-Path $seedVhdx) { Remove-Item $seedVhdx -Force }
New-VHD -Path $seedVhdx -SizeBytes 64MB -Dynamic | Out-Null
$disk = Mount-VHD -Path $seedVhdx -Passthru | Get-Disk
$disk | Initialize-Disk -PartitionStyle MBR -PassThru |
    New-Partition -UseMaximumSize -AssignDriveLetter |
    Format-Volume -FileSystem FAT -NewFileSystemLabel 'CIDATA' -Confirm:$false | Out-Null
$drive = (Get-Partition -DiskNumber $disk.Number | Where-Object DriveLetter).DriveLetter
# cloud-init exige nomes EXATOS sem extensao e LF
[System.IO.File]::WriteAllText("${drive}:\user-data", ($ud -replace "`r`n","`n"))
[System.IO.File]::WriteAllText("${drive}:\meta-data", ($md -replace "`r`n","`n"))
Dismount-VHD -Path $seedVhdx
Write-Ok "Seed CIDATA criado: $seedVhdx"

# ---------------------------------------------------------------------------
# 4b. Patch cloud-init (imagem -azure ignora NoCloud por padrao no Hyper-V)
# ---------------------------------------------------------------------------
Write-Step "Ajustando datasource do cloud-init (NoCloud)"
Invoke-NoCloudPatch $osVhdx

# ---------------------------------------------------------------------------
# 5. Virtual Switch externo
# ---------------------------------------------------------------------------
Write-Step "Rede (Virtual Switch)"
if ($cfg.CreateSwitch) {
    $sw = Get-VMSwitch -Name $cfg.SwitchName -ErrorAction SilentlyContinue
    if (-not $sw) {
        $nic = $cfg.PhysicalAdapterName
        if (-not $nic) {
            $nic = (Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object LinkSpeed -Descending | Select-Object -First 1).Name
        }
        if (-not $nic) { throw "Nenhum adaptador fisico 'Up' encontrado. Defina PhysicalAdapterName na config." }
        Write-Host "  Criando switch externo '$($cfg.SwitchName)' sobre a NIC '$nic' ..."
        New-VMSwitch -Name $cfg.SwitchName -NetAdapterName $nic -AllowManagementOS $true | Out-Null
        Write-Ok "Switch externo criado"
    } else { Write-Ok "Switch '$($cfg.SwitchName)' ja existe (reuso)" }
}

# ---------------------------------------------------------------------------
# 6. Criar / configurar VM
# ---------------------------------------------------------------------------
Write-Step "Criando VM"
$existing = Get-VM -Name $cfg.VMName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Warn2 "VM '$($cfg.VMName)' ja existe."
    $ans = Read-Host "  Remover e recriar? (digite 'sim' para confirmar)"
    if ($ans -eq 'sim') {
        if ($existing.State -ne 'Off') { Stop-VM -Name $cfg.VMName -TurnOff -Force }
        Remove-VM -Name $cfg.VMName -Force
        Write-Ok "VM anterior removida"
    } else { throw "Abortado pelo usuario (VM ja existe)." }
}
New-VM -Name $cfg.VMName -Generation $cfg.Generation -MemoryStartupBytes ($cfg.MemoryGB * 1GB) `
       -VHDPath $osVhdx -SwitchName $cfg.SwitchName | Out-Null
Set-VMProcessor -VMName $cfg.VMName -Count $cfg.CPUCount
Set-VMMemory -VMName $cfg.VMName -DynamicMemoryEnabled $false
Add-VMHardDiskDrive -VMName $cfg.VMName -Path $seedVhdx
if ($cfg.Generation -eq 2) {
    # Secure Boot OFF (cloud image Linux nao tem shim assinado MS)
    Set-VMFirmware -VMName $cfg.VMName -EnableSecureBoot Off
    $osDrive = Get-VMHardDiskDrive -VMName $cfg.VMName | Where-Object { $_.Path -eq $osVhdx }
    Set-VMFirmware -VMName $cfg.VMName -FirstBootDevice $osDrive
}
Set-VM -Name $cfg.VMName -AutomaticStartAction Start -AutomaticStopAction ShutDown
Write-Ok "VM criada e configurada"

# ---------------------------------------------------------------------------
# 7. Iniciar + aguardar IP
# ---------------------------------------------------------------------------
Write-Step "Iniciando VM"
Start-VM -Name $cfg.VMName
Write-Host "  Aguardando boot + cloud-init (pode levar varios minutos na 1a vez)..."
$ip = $null
for ($i=0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 10
    $ips = (Get-VMNetworkAdapter -VMName $cfg.VMName).IPAddresses |
           Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notlike '169.254.*' }
    if ($ips) { $ip = $ips | Select-Object -First 1; break }
}

# ---------------------------------------------------------------------------
# 8. Resultado
# ---------------------------------------------------------------------------
Write-Step "Concluido"
if ($ip) {
    Write-Host "  Shinobi (apos cloud-init terminar):" -ForegroundColor Green
    Write-Host "    Superuser : http://${ip}:8080/super" -ForegroundColor Green
    Write-Host "    Dashboard : http://${ip}:8080/" -ForegroundColor Green
    Write-Host "    SSH       : ssh $($cfg.OSUsername)@${ip}"
} else {
    Write-Warn2 "Nao consegui ler o IP via integration services."
    Write-Warn2 "Abra o console da VM (vmconnect) ou veja o lease no seu roteador."
}
Write-Host "`n  Credenciais salvas em: $secretsFile" -ForegroundColor Cyan
Write-Host "  Acompanhe a instalacao dentro da VM: tail -f /var/log/shinobi-install.log`n"
