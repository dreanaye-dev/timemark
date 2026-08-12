# Server lokal untuk aplikasi TimeMark PWA.
# Jalankan dengan:  .\start.ps1
# Lalu buka  http://localhost:8080  di Chrome/Edge (HP atau komputer).

$port = 8080
$root = $PSScriptRoot

Write-Host ""
Write-Host "  TimeMark - server lokal di http://localhost:$port"
Write-Host "  Tekan Ctrl+C untuk menghentikan."
Write-Host ""

# Coba Python dulu, fallback ke Node.
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
    Set-Location $root
    python -m http.server $port
    exit
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $js = @'
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = __dirname;
const port = process.argv[2] || 8080;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon"
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log(`TimeMark ready at http://localhost:${port}`));
'@
    $tmp = Join-Path $env:TEMP "opencode\timemark-server.js"
    New-Item -ItemType Directory -Force -Path (Split-Path $tmp) | Out-Null
    Set-Content -LiteralPath $tmp -Value $js -Encoding UTF8
    node $tmp $port
    exit
}

Write-Host "ERROR: Python dan Node tidak ditemukan. Install salah satunya dulu."
exit 1