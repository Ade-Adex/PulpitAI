$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Adeolu\Adex\Christ BC\PulpitAI'
$out = 'C:\Users\Adeolu\Adex\Christ BC\PulpitAI\_install_out.txt'

function Write-Log($m) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m
    Add-Content -Path $out -Value $line
    Write-Output $line
}

Set-Content -Path $out -Value ''

# 1. Kill stray node/npm processes holding locks
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process npm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Write-Log 'stray processes cleared'

# 2. Remove node_modules
if (Test-Path 'node_modules') {
    Write-Log 'removing node_modules...'
    cmd /c 'rmdir /s /q node_modules' 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    if (Test-Path 'node_modules') {
        cmd /c 'rmdir /s /q node_modules' 2>&1 | Out-Null
        Start-Sleep -Seconds 3
    }
}
if (Test-Path 'node_modules') {
    Write-Log 'FAILED_TO_REMOVE_NODE_MODULES'
    exit 2
}
Write-Log 'node_modules removed OK'

# 3. Lockfile must exist for npm ci
if (-not (Test-Path 'package-lock.json')) {
    Write-Log 'MISSING_LOCKFILE'
    exit 3
}
Write-Log ("lockfile present, {0} bytes" -f (Get-Item 'package-lock.json').Length)

# 4. Record toolchain versions
Write-Log ("node: " + (& node --version 2>&1))
Write-Log ("npm:  " + (& npm --version 2>&1))

# 5. npm ci
Write-Log 'starting npm ci...'
cmd /c 'npm ci --no-audit --no-fund' 2>&1 | ForEach-Object { Add-Content -Path $out -Value $_ }
$code = $LASTEXITCODE
Write-Log "EXIT=$code"

# 6. Verify bin dir
if (Test-Path 'node_modules\.bin') {
    $bins = Get-ChildItem 'node_modules\.bin' -Force | Select-Object -ExpandProperty Name
    Write-Log ("BIN_COUNT=" + $bins.Count)
    # Only check binaries this project actually depends on.
    # (jest is NOT a dependency of PulpitAI — checking it here would always
    #  report MISSING_JEST and look like a broken install.)
    foreach ($b in @('vite', 'electron', 'electron-builder', 'esbuild')) {
        if ($bins -contains ($b + '.cmd')) { Write-Log ("HAS_" + $b.ToUpper()) }
        else { Write-Log ("MISSING_" + $b.ToUpper()) }
    }
} else {
    Write-Log 'NO_BIN_DIR'
}
Write-Log 'DONE'

