$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$desktopRoot = [Environment]::GetFolderPath("Desktop")
$buildRoot = Join-Path $projectRoot "build-desktop"
$distRoot = Join-Path $projectRoot "dist"
$releaseRoot = Join-Path $desktopRoot "Toetsing App"
$exePath = Join-Path $releaseRoot "Toetsing\Toetsing.exe"
$shortcutPath = Join-Path $desktopRoot "Toetsing.lnk"

if (-not (Test-Path $venvPython)) {
    throw "Python-venv niet gevonden op $venvPython"
}

Push-Location $projectRoot
try {
    if (Test-Path $buildRoot) {
        Remove-Item -LiteralPath $buildRoot -Recurse -Force
    }
    if (Test-Path $distRoot) {
        Remove-Item -LiteralPath $distRoot -Recurse -Force
    }
    if (Test-Path $releaseRoot) {
        Remove-Item -LiteralPath $releaseRoot -Recurse -Force
    }

    & $venvPython -m PyInstaller `
        --noconfirm `
        --clean `
        --windowed `
        --name Toetsing `
        --collect-all webview `
        --hidden-import uvicorn.logging `
        --hidden-import uvicorn.loops.auto `
        --hidden-import uvicorn.protocols.http.auto `
        --hidden-import uvicorn.protocols.websockets.auto `
        --add-data "static;static" `
        --add-data "data;data" `
        desktop_launcher.py

    New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $distRoot "Toetsing") -Destination $releaseRoot -Recurse -Force

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = Split-Path -Parent $exePath
    $shortcut.IconLocation = $exePath
    $shortcut.Save()

    Write-Output "BUILD_OK"
    Write-Output "EXE=$exePath"
    Write-Output "SHORTCUT=$shortcutPath"
}
finally {
    Pop-Location
}
