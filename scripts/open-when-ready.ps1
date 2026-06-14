# Espera a que el servidor de desarrollo responda y abre el navegador.
# Lo lanza VideoForge.cmd en segundo plano; sale solo tras abrir el navegador.
$url = 'http://localhost:5173'
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 700
  try {
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
    Start-Process $url
    break
  } catch {
    # aún no está listo; reintenta
  }
}
