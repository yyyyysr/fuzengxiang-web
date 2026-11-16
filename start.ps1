# 启动傅增湘藏书家智能体网站
#   .\start.ps1          生产模式：构建前端（如需要）并由后端在 http://127.0.0.1:8000 提供整站
#   .\start.ps1 -Dev     开发模式：后端 :8000 + Vite 热更新 :5173
#   .\start.ps1 -Build   强制重新构建前端
param([switch]$Dev, [switch]$Build)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"

# 后端 Python：优先使用知识库的 .venv（已含 fastapi、向量检索依赖），否则用 PATH 中的 python
$py = $env:KB_PYTHON
if (-not $py) {
  $venv = Join-Path $root "..\藏书家智能体\knowledge_base\.venv\Scripts\python.exe"
  $py = if (Test-Path $venv) { (Resolve-Path $venv).Path } else { "python" }
}

if (-not (Test-Path "$root\web\public\xiaofu\idle.webp")) { & python "$root\scripts\prepare_assets.py" }
if (-not (Test-Path "$root\web\node_modules")) { Push-Location "$root\web"; npm install --no-audit --no-fund; Pop-Location }

if ($Dev) {
  Start-Process -FilePath $py -ArgumentList "`"$root\server\app.py`"" -WorkingDirectory $root
  Push-Location "$root\web"; npx vite --host 127.0.0.1 --port 5173; Pop-Location
  exit
}

if ($Build -or -not (Test-Path "$root\web\dist\index.html")) {
  Push-Location "$root\web"; npm run build; Pop-Location
}
Write-Host "网站地址：http://127.0.0.1:8000" -ForegroundColor Green
& $py "$root\server\app.py"
