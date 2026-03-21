#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const defaultAllowedExtensions = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
  'zip', 'rar', '7z',
  'txt', 'csv', 'xml', 'json', 'html', 'htm'
];

function normalizeExtensions(input) {
  const source = Array.isArray(input) ? input : defaultAllowedExtensions;
  const seen = new Set();
  return source
    .map((value) => String(value || '').trim().toLowerCase().replace(/^\./, ''))
    .filter((value) => /^[a-z0-9]{1,10}$/.test(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function escapePsSingle(value) {
  return String(value || '').replace(/'/g, "''");
}

function buildPickerScript(extensions) {
  const psExtensions = extensions.map((ext) => `'${escapePsSingle(ext)}'`).join(', ');
  return [
    "$utf8 = New-Object System.Text.UTF8Encoding($false)",
    "[Console]::OutputEncoding = $utf8",
    "$OutputEncoding = $utf8",
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    `$allowed = @(${psExtensions})`,
    "$patterns = $allowed | ForEach-Object { \"*.${_}\" }",
    "$joined = $patterns -join ';'",
    "$filter = \"Arquivos permitidos ($joined)|$joined|Todos os arquivos (*.*)|*.*\"",
    "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
    "$dialog.Filter = $filter",
    "$dialog.FilterIndex = 1",
    "$dialog.Multiselect = $false",
    "$dialog.CheckFileExists = $true",
    "$dialog.Title = 'Selecionar arquivo'",
    "$result = $dialog.ShowDialog()",
    "if ($result -ne [System.Windows.Forms.DialogResult]::OK) {",
    "  Write-Output '__CANCELLED__'",
    "  exit 0",
    "}",
    "Write-Output $dialog.FileName"
  ].join('; ');
}

function openNativePicker(extensions) {
  const script = buildPickerScript(extensions);
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-STA',
    '-Command', script
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
  const output = String(result.stdout || '').trim();
  const errorOutput = String(result.stderr || '').trim();
  if (output === '__CANCELLED__') {
    return { ok: false, code: 'CANCELLED', message: 'Seleção cancelada.' };
  }
  if (result.status !== 0 && !output) {
    return {
      ok: false,
      code: 'PICKER_FAILED',
      message: errorOutput || 'Falha ao abrir seletor de arquivos.'
    };
  }
  if (!output) {
    return { ok: false, code: 'EMPTY_SELECTION', message: 'Nenhum arquivo selecionado.' };
  }
  return { ok: true, selectedPath: output };
}

function getFileExtension(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase().replace(/^\./, '');
  return extension;
}

function isUncPath(filePath) {
  return /^\\\\[^\\]+\\[^\\]+/i.test(String(filePath || ''));
}

function resolveDriveToUncRoot(driveLetter) {
  const drive = `${String(driveLetter || '').toUpperCase()}:`;
  const script = [
    `$drive='${escapePsSingle(drive)}'`,
    "$provider=(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$drive'\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProviderName -ErrorAction SilentlyContinue)",
    "if ($provider) { Write-Output $provider }"
  ].join('; ');
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 });
  return String(result.stdout || '').trim();
}

function toUncPath(filePath) {
  const source = String(filePath || '').trim();
  if (!source) return '';
  if (isUncPath(source)) return source;
  const driveMatch = source.match(/^([a-zA-Z]):\\/);
  if (!driveMatch) return '';
  const driveLetter = driveMatch[1];
  const uncRoot = resolveDriveToUncRoot(driveLetter);
  if (!uncRoot || !isUncPath(uncRoot)) return '';
  const relativePath = source.slice(3).replace(/\\/g, '/');
  const normalizedRoot = uncRoot.replace(/[\\/]+$/, '');
  return relativePath ? `${normalizedRoot}\\${relativePath.replace(/\//g, '\\')}` : normalizedRoot;
}

function encodePathSegments(segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function toFileUrl(filePath) {
  const source = String(filePath || '').trim();
  if (!source) return '';
  if (isUncPath(source)) {
    const trimmed = source.replace(/^\\\\+/, '');
    const segments = trimmed.split('\\').filter(Boolean);
    if (!segments.length) return '';
    return `file://///${encodePathSegments(segments)}`;
  }
  const driveMatch = source.match(/^([a-zA-Z]):\\(.*)$/);
  if (!driveMatch) return '';
  const drive = driveMatch[1].toUpperCase();
  const segments = driveMatch[2].split('\\').filter(Boolean);
  const encodedTail = encodePathSegments(segments);
  return encodedTail ? `file:///${drive}:/${encodedTail}` : `file:///${drive}:/`;
}

function fileUrlToWindowsPath(fileUrl) {
  const raw = String(fileUrl || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (!/^file:$/i.test(parsed.protocol)) return '';
  const decodedPathname = (() => {
    try {
      return decodeURIComponent(parsed.pathname || '');
    } catch {
      return '';
    }
  })();
  if (!decodedPathname) return '';
  if (/^\/[a-zA-Z]:\//.test(decodedPathname)) {
    return decodedPathname.slice(1).replace(/\//g, '\\');
  }
  if (parsed.host) {
    const tail = decodedPathname.replace(/^\/+/, '');
    return tail ? `\\\\${parsed.host}\\${tail.replace(/\//g, '\\')}` : `\\\\${parsed.host}`;
  }
  if (/^\/{2,}/.test(decodedPathname)) {
    const uncBody = decodedPathname.replace(/^\/+/, '');
    return uncBody ? `\\\\${uncBody.replace(/\//g, '\\')}` : '';
  }
  return '';
}

function hasCorruptedUtf8Marker(value) {
  const raw = String(value || '');
  if (!raw) return false;
  if (/%ef%bf%bd/i.test(raw)) return true;
  if (raw.includes('\uFFFD')) return true;
  return false;
}

function openWindowsPath(filePath) {
  const targetPath = String(filePath || '').trim();
  if (!targetPath) {
    return { ok: false, code: 'INVALID_PATH', message: 'Caminho inválido para abertura.' };
  }
  const script = [
    `$target='${escapePsSingle(targetPath)}'`,
    'Start-Process -FilePath $target'
  ].join('; ');
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
  if (result.status !== 0) {
    const errorOutput = String(result.stderr || '').trim();
    return {
      ok: false,
      code: 'OPEN_FAILED',
      message: errorOutput || 'Falha ao abrir arquivo no Windows.'
    };
  }
  return { ok: true };
}

async function pickFile(payload) {
  const allowedExtensions = normalizeExtensions(payload && payload.allowedExtensions);
  const selection = openNativePicker(allowedExtensions);
  if (!selection.ok) return selection;
  const selectedPath = selection.selectedPath;
  const extension = getFileExtension(selectedPath);
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, code: 'INVALID_EXTENSION', message: 'Extensão não permitida.' };
  }
  const preferUnc = !(payload && payload.preferUnc === false);
  const uncPath = toUncPath(selectedPath);
  const finalPath = preferUnc && uncPath ? uncPath : selectedPath;
  const fileUrl = toFileUrl(finalPath);
  if (!fileUrl) {
    return { ok: false, code: 'INVALID_PATH', message: 'Caminho inválido para URL file://.' };
  }
  return {
    ok: true,
    fileName: path.basename(selectedPath),
    extension,
    pathWindows: selectedPath,
    pathUnc: uncPath || '',
    fileUrl,
    isNetworkPath: Boolean(isUncPath(finalPath))
  };
}

async function openFile(payload) {
  const allowedExtensions = normalizeExtensions(payload && payload.allowedExtensions);
  const fileUrl = String((payload && payload.fileUrl) || '').trim();
  if (!fileUrl) {
    return { ok: false, code: 'INVALID_FILE_URL', message: 'URL de arquivo ausente.' };
  }
  if (hasCorruptedUtf8Marker(fileUrl)) {
    return {
      ok: false,
      code: 'CORRUPTED_FILE_URL',
      message: 'Link de arquivo com caracteres inválidos. Reanexe o arquivo pelo seletor nativo.'
    };
  }
  const filePath = fileUrlToWindowsPath(fileUrl);
  if (!filePath) {
    return { ok: false, code: 'INVALID_FILE_URL', message: 'URL file:// inválida.' };
  }
  if (hasCorruptedUtf8Marker(filePath)) {
    return {
      ok: false,
      code: 'CORRUPTED_FILE_PATH',
      message: 'Caminho de arquivo com caracteres inválidos. Reanexe o arquivo pelo seletor nativo.'
    };
  }
  const extension = getFileExtension(filePath);
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, code: 'INVALID_EXTENSION', message: 'Extensão não permitida.' };
  }
  const opened = openWindowsPath(filePath);
  if (!opened.ok) return opened;
  return {
    ok: true,
    pathWindows: filePath,
    extension,
    isNetworkPath: Boolean(isUncPath(filePath))
  };
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return { ok: false, code: 'INVALID_REQUEST', message: 'Mensagem inválida.' };
  }
  if (message.action === 'pickFile') {
    return pickFile(message);
  }
  if (message.action === 'openFile') {
    return openFile(message);
  }
  return { ok: false, code: 'UNKNOWN_ACTION', message: 'Ação não suportada.' };
}

function writeNativeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
}

let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < length + 4) break;
    const jsonBuffer = inputBuffer.slice(4, 4 + length);
    inputBuffer = inputBuffer.slice(4 + length);
    let parsed = null;
    try {
      parsed = JSON.parse(jsonBuffer.toString('utf8'));
    } catch {
      writeNativeMessage({ ok: false, code: 'INVALID_JSON', message: 'JSON inválido.' });
      continue;
    }
    handleMessage(parsed)
      .then((result) => writeNativeMessage(result))
      .catch((error) => writeNativeMessage({
        ok: false,
        code: 'HOST_ERROR',
        message: String(error && error.message ? error.message : 'Falha no host nativo.')
      }));
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});
