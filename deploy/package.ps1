# 生成服务器部署包：构建前端 + 后端代码 + 知识库运行所需数据（含向量与 ONNX 查询编码器；不含原始 PDF 与 Python 虚拟环境）
#   .\deploy\package.ps1  ->  deploy\out\fuzengxiang-deploy.tar.gz
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$kb = if ($env:KB_ROOT) { $env:KB_ROOT } else {
  (Get-ChildItem (Split-Path $root -Parent) -Directory | Where-Object { Test-Path (Join-Path $_.FullName "knowledge_base\data\export") } | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "knowledge_base" })
}
if (-not $kb) { throw "knowledge_base not found; set KB_ROOT" }
$stage = Join-Path $env:TEMP "fuzengxiang-stage"
$out = Join-Path $PSScriptRoot "out"

Push-Location "$root\web"; npm run build; Pop-Location

Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$stage\app\web", "$stage\kb\data\index", $out | Out-Null
Copy-Item "$root\server" "$stage\app\server" -Recurse -Exclude "__pycache__"
Copy-Item "$root\web\dist" "$stage\app\web\dist" -Recurse
New-Item -ItemType Directory -Force "$stage\app\deploy" | Out-Null
Copy-Item "$root\deploy\install.sh", "$root\deploy\requirements-server.txt" "$stage\app\deploy\"
Copy-Item "$kb\data\export" "$stage\kb\data\export" -Recurse
Copy-Item "$kb\data\index\kb.sqlite", "$kb\data\index\embeddings.npy", "$kb\data\index\embeddings_ids.json" "$stage\kb\data\index\"
if (Test-Path "$kb\data\index\onnx\model.onnx") { Copy-Item "$kb\data\index\onnx" "$stage\kb\data\index\onnx" -Recurse }
Copy-Item "$kb\assets" "$stage\kb\assets" -Recurse
Get-ChildItem $stage -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

$tar = Join-Path $out "fuzengxiang-deploy.tar.gz"
tar -czf $tar -C $stage app kb
"{0}  {1:N1} MB" -f $tar, ((Get-Item $tar).Length / 1MB)
