# Gera o APK sem Gradle, usando as ferramentas do Android SDK e o JDK do Android Studio.
# Uso: powershell -ExecutionPolicy Bypass -File android\build.ps1 [-Debuggable]
param([switch]$Debuggable)

$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$repo = Split-Path -Parent $here
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$tools = Get-ChildItem "$sdk\build-tools" | Sort-Object { [version]$_.Name } | Select-Object -Last 1 -ExpandProperty FullName
$androidJar = Get-ChildItem "$sdk\platforms\*\android.jar" | Select-Object -Last 1 -ExpandProperty FullName
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$jdk = "$env:JAVA_HOME\bin"

$build = "$here\build"
$signing = "$here\signing"
$output = "$repo\Financas.apk"

function Run([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "Falhou: $exe $($arguments -join ' ')" }
}

Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in 'gen', 'classes', 'dex', 'res-extra\drawable-nodpi', 'assets\www') {
  [void][IO.Directory]::CreateDirectory("$build\$dir")
}

# Interface: os mesmos arquivos da versão web.
foreach ($item in 'index.html', 'css', 'js', 'icons') {
  Copy-Item "$repo\$item" "$build\assets\www\" -Recurse
}
Copy-Item "$repo\icons\icon-512.png" "$build\res-extra\drawable-nodpi\ic_launcher.png"

# A chave identifica o app: sem ela, novas versões não instalam por cima da atual.
if (-not (Test-Path "$signing\financas.keystore")) {
  [void][IO.Directory]::CreateDirectory($signing)
  $password = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  [IO.File]::WriteAllText("$signing\password.txt", $password)
  Run "$jdk\keytool.exe" @('-genkeypair', '-keystore', "$signing\financas.keystore", '-storetype', 'PKCS12',
    '-alias', 'financas', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', $password, '-dname', 'CN=Financas Pessoais')
}

# Recursos e manifesto.
Run "$tools\aapt2.exe" @('compile', '--dir', "$here\res", '-o', "$build\res.zip")
Run "$tools\aapt2.exe" @('compile', '--dir', "$build\res-extra", '-o', "$build\res-extra.zip")
$manifest = "$build\AndroidManifest.xml"
$xml = [IO.File]::ReadAllText("$here\AndroidManifest.xml")
if ($Debuggable) { $xml = $xml.Replace('android:allowBackup="false"', 'android:allowBackup="false" android:debuggable="true"') }
[IO.File]::WriteAllText($manifest, $xml)
# Finanças Low Features: outro app (pacote br.financas.pais). O R.java continua em br.financas.pessoais
# e o aapt2 completa os nomes das telas com o pacote original.
Run "$tools\aapt2.exe" @('link', '-o', "$build\base.apk", '-I', $androidJar, '--manifest', $manifest,
  '--rename-manifest-package', 'br.financas.pais',
  '--java', "$build\gen", "$build\res.zip", "$build\res-extra.zip")

# Código.
$sources = (Get-ChildItem "$here\src", "$build\gen" -Recurse -Filter *.java).FullName
Run "$jdk\javac.exe" (@('-nowarn', '-Xlint:-options', '-source', '11', '-target', '11', '-cp', $androidJar, '-d', "$build\classes") + $sources)
$classes = (Get-ChildItem "$build\classes" -Recurse -Filter *.class).FullName
Run "$tools\d8.bat" (@('--release', '--lib', $androidJar, '--min-api', '26', '--output', "$build\dex") + $classes)

# Empacotamento e assinatura.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$build\base.apk", 'Update')
[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$build\dex\classes.dex", 'classes.dex')
# Fora do aapt2: no Windows ele grava os caminhos com "\" e o Android não encontra os arquivos.
foreach ($file in Get-ChildItem "$build\assets" -Recurse -File) {
  $entry = 'assets/' + $file.FullName.Substring("$build\assets\".Length).Replace('\', '/')
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entry)
}
$zip.Dispose()

Run "$tools\zipalign.exe" @('-p', '-f', '4', "$build\base.apk", "$build\aligned.apk")
$password = [IO.File]::ReadAllText("$signing\password.txt")
Run "$tools\apksigner.bat" @('sign', '--ks', "$signing\financas.keystore", '--ks-pass', "pass:$password",
  '--ks-key-alias', 'financas', '--out', $output, "$build\aligned.apk")
Run "$tools\apksigner.bat" @('verify', $output)

Remove-Item "$output.idsig" -ErrorAction SilentlyContinue
"APK gerado: $output ($([math]::Round((Get-Item $output).Length / 1KB)) KB)"
