# 启动傅增湘藏书家智能体网站（Windows；也可双击 start.bat）
#   .\start.ps1          生产模式：构建前端（如需要）并由后端在 http://127.0.0.1:8000 提供整站
#   .\start.ps1 -Dev     开发模式：后端 :8000 + Vite 热更新 :5173
#   .\start.ps1 -Build   强制重新构建前端
param([switch]$Dev, [switch]$Build)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "缺少 Node.js 18+，请先安装：https://nodejs.org" }

# 后端 Python：KB_PYTHON > 知识库 .venv > 本项目 .venv（首次运行自动创建并安装依赖）
function Test-Deps($exe) {
  & $exe -c "import fastapi, uvicorn, httpx, jieba, opencc, yaml" 2>$null
  return $LASTEXITCODE -eq 0
}
$py = $env:KB_PYTHON
$kbVenv = Join-Path $root "..\藏书家智能体\knowledge_base\.venv\Scripts\python.exe"
if (-not $py -and (Test-Path $kbVenv) -and (Test-Deps $kbVenv)) { $py = (Resolve-Path $kbVenv).Path }
if (-not $py) {
  $py = Join-Path $root ".venv\Scripts\python.exe"
  if (-not (Test-Path $py)) {
    $sys = Get-Command python -ErrorAction SilentlyContinue
    if (-not $sys) { $sys = Get-Command py -ErrorAction SilentlyContinue }
    if (-not $sys) { throw "缺少 Python 3.10+，请先安装：https://www.python.org" }
    Write-Host "==> 创建 Python 虚拟环境 .venv"
    & $sys.Source -m venv (Join-Path $root ".venv")
  }
  if (-not (Test-Deps $py)) {
    Write-Host "==> 安装后端依赖（deploy\requirements-server.txt）"
    & $py -m pip install -q --upgrade pip
    & $py -m pip install -q -r "$root\deploy\requirements-server.txt"
  }
}

if (-not (Test-Path "$root\web\node_modules")) {
  Write-Host "==> 安装前端依赖"
  Push-Location "$root\web"; npm install --no-audit --no-fund; Pop-Location
}

if ($Dev) {
  Start-Process -FilePath $py -ArgumentList "`"$root\server\app.py`"" -WorkingDirectory $root
  Push-Location "$root\web"; npx vite --host 127.0.0.1 --port 5173; Pop-Location
  exit
}

if ($Build -or -not (Test-Path "$root\web\dist\index.html")) {
  Write-Host "==> 构建前端"
  Push-Location "$root\web"; npm run build; Pop-Location
}
$port = if ($env:PORT) { $env:PORT } else { "8000" }
Write-Host "网站地址：http://127.0.0.1:$port" -ForegroundColor Green
& $py "$root\server\app.py"
