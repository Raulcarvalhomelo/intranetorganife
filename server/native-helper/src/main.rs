use percent_encoding::{utf8_percent_encode, percent_decode_str, AsciiSet, CONTROLS};
use serde_json::{json, Value};
use std::env;
use std::io::{self, Read, Write};
use std::path::Path;
use std::process::Command;
use url::Url;

const DEFAULT_ALLOWED_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg",
    "zip", "rar", "7z",
    "txt", "csv", "xml", "json", "html", "htm"
];

const ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'<')
    .add(b'>')
    .add(b'`')
    .add(b'#')
    .add(b'?')
    .add(b'{')
    .add(b'}');

fn response(ok: bool, code: &str, message: &str) -> Value {
    json!({ "ok": ok, "code": code, "message": message })
}

fn normalize_extensions(input: Option<&Value>) -> Vec<String> {
    let source = input.and_then(|v| v.as_array()).cloned().unwrap_or_else(|| {
        DEFAULT_ALLOWED_EXTENSIONS.iter().map(|v| Value::String((*v).to_string())).collect()
    });
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for value in source {
        let mut normalized = value.as_str().unwrap_or("").trim().to_lowercase();
        if normalized.starts_with('.') {
            normalized = normalized.trim_start_matches('.').to_string();
        }
        let valid = !normalized.is_empty()
            && normalized.len() <= 10
            && normalized.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        if valid && seen.insert(normalized.clone()) {
            out.push(normalized);
        }
    }
    out
}

fn escape_ps_single(value: &str) -> String {
    value.replace('\'', "''")
}

fn run_powershell(args: &[String]) -> io::Result<std::process::Output> {
    Command::new("powershell.exe")
        .args(args)
        .output()
}

fn build_picker_script(extensions: &[String]) -> String {
    let ps_extensions = extensions.iter()
        .map(|ext| format!("'{}'", escape_ps_single(ext)))
        .collect::<Vec<String>>()
        .join(", ");
    [
        "$utf8 = New-Object System.Text.UTF8Encoding($false)",
        "[Console]::OutputEncoding = $utf8",
        "$OutputEncoding = $utf8",
        "Add-Type -AssemblyName System.Windows.Forms",
        "[System.Windows.Forms.Application]::EnableVisualStyles()",
        &format!("$allowed = @({})", ps_extensions),
        "$patterns = $allowed | ForEach-Object { \"*.$_\" }",
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
        "Write-Output $dialog.FileName",
    ].join("; ")
}

fn open_native_picker(extensions: &[String]) -> Value {
    let script = build_picker_script(extensions);
    let args = vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(), "Bypass".to_string(),
        "-STA".to_string(),
        "-Command".to_string(), script,
    ];
    match run_powershell(&args) {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if stdout == "__CANCELLED__" {
                return response(false, "CANCELLED", "Seleção cancelada.");
            }
            if !output.status.success() && stdout.is_empty() {
                return response(
                    false,
                    "PICKER_FAILED",
                    if stderr.is_empty() { "Falha ao abrir seletor de arquivos." } else { &stderr }
                );
            }
            if stdout.is_empty() {
                return response(false, "EMPTY_SELECTION", "Nenhum arquivo selecionado.");
            }
            json!({ "ok": true, "selectedPath": stdout })
        }
        Err(err) => response(false, "PICKER_FAILED", &err.to_string()),
    }
}

fn get_file_extension(file_path: &str) -> String {
    Path::new(file_path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default()
}

fn is_unc_path(file_path: &str) -> bool {
    let bytes = file_path.as_bytes();
    if bytes.len() < 5 || bytes[0] != b'\\' || bytes[1] != b'\\' {
        return false;
    }
    let rest = &file_path[2..];
    let parts: Vec<&str> = rest.split('\\').filter(|p| !p.is_empty()).collect();
    parts.len() >= 2
}

fn resolve_drive_to_unc_root(drive_letter: &str) -> String {
    let drive = format!("{}:", drive_letter.to_uppercase());
    let script = [
        format!("$drive='{}'", escape_ps_single(&drive)),
        "$provider=(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$drive'\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProviderName -ErrorAction SilentlyContinue)".to_string(),
        "if ($provider) { Write-Output $provider }".to_string(),
    ].join("; ");
    let args = vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(), "Bypass".to_string(),
        "-Command".to_string(), script,
    ];
    run_powershell(&args)
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .unwrap_or_default()
}

fn to_unc_path(file_path: &str) -> String {
    let source = file_path.trim();
    if source.is_empty() {
        return String::new();
    }
    if is_unc_path(source) {
        return source.to_string();
    }
    let chars: Vec<char> = source.chars().collect();
    if chars.len() < 3 || !chars[0].is_ascii_alphabetic() || chars[1] != ':' || chars[2] != '\\' {
        return String::new();
    }
    let drive_letter = chars[0].to_string();
    let unc_root = resolve_drive_to_unc_root(&drive_letter);
    if unc_root.is_empty() || !is_unc_path(&unc_root) {
        return String::new();
    }
    let relative_path = source[3..].replace('\\', "/");
    let normalized_root = unc_root.trim_end_matches(['\\', '/']);
    if relative_path.is_empty() {
        normalized_root.to_string()
    } else {
        format!("{}\\{}", normalized_root, relative_path.replace('/', "\\"))
    }
}

fn encode_path_segments(segments: &[&str]) -> String {
    segments.iter()
        .map(|segment| utf8_percent_encode(segment, ENCODE_SET).to_string())
        .collect::<Vec<String>>()
        .join("/")
}

fn to_file_url(file_path: &str) -> String {
    let source = file_path.trim();
    if source.is_empty() {
        return String::new();
    }
    if is_unc_path(source) {
        let trimmed = source.trim_start_matches('\\');
        let segments: Vec<&str> = trimmed.split('\\').filter(|s| !s.is_empty()).collect();
        if segments.is_empty() {
            return String::new();
        }
        return format!("file://///{}", encode_path_segments(&segments));
    }
    let chars: Vec<char> = source.chars().collect();
    if chars.len() < 2 || !chars[0].is_ascii_alphabetic() || chars[1] != ':' {
        return String::new();
    }
    let drive = chars[0].to_ascii_uppercase();
    let tail = if chars.len() >= 4 && chars[2] == '\\' {
        source[3..].to_string()
    } else if chars.len() == 2 {
        String::new()
    } else {
        return String::new();
    };
    if tail.is_empty() {
        return format!("file:///{}:/", drive);
    }
    let segments: Vec<&str> = tail.split('\\').filter(|s| !s.is_empty()).collect();
    let encoded_tail = encode_path_segments(&segments);
    format!("file:///{}:/{}", drive, encoded_tail)
}

fn file_url_to_windows_path(file_url: &str) -> String {
    let raw = file_url.trim();
    if raw.is_empty() {
        return String::new();
    }
    let parsed = match Url::parse(raw) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    if parsed.scheme().to_lowercase() != "file" {
        return String::new();
    }
    let decoded_pathname = match percent_decode_str(parsed.path()).decode_utf8() {
        Ok(v) => v.to_string(),
        Err(_) => return String::new(),
    };
    if decoded_pathname.is_empty() {
        return String::new();
    }
    let path_bytes = decoded_pathname.as_bytes();
    if path_bytes.len() >= 4
        && path_bytes[0] == b'/'
        && (path_bytes[1] as char).is_ascii_alphabetic()
        && path_bytes[2] == b':'
        && path_bytes[3] == b'/'
    {
        return decoded_pathname[1..].replace('/', "\\");
    }
    if let Some(host) = parsed.host_str() {
        let tail = decoded_pathname.trim_start_matches('/');
        if tail.is_empty() {
            return format!("\\\\{}", host);
        }
        return format!("\\\\{}\\{}", host, tail.replace('/', "\\"));
    }
    if decoded_pathname.starts_with("//") {
        let unc_body = decoded_pathname.trim_start_matches('/');
        if unc_body.is_empty() {
            return String::new();
        }
        return format!("\\\\{}", unc_body.replace('/', "\\"));
    }
    String::new()
}

fn has_corrupted_utf8_marker(value: &str) -> bool {
    let raw = value;
    if raw.is_empty() {
        return false;
    }
    if raw.to_lowercase().contains("%ef%bf%bd") {
        return true;
    }
    raw.contains('\u{FFFD}')
}

fn open_windows_path(file_path: &str) -> Value {
    let target_path = file_path.trim();
    if target_path.is_empty() {
        return response(false, "INVALID_PATH", "Caminho inválido para abertura.");
    }
    let script = [
        format!("$target='{}'", escape_ps_single(target_path)),
        "Start-Process -FilePath $target".to_string(),
    ].join("; ");
    let args = vec![
        "-NoProfile".to_string(),
        "-ExecutionPolicy".to_string(), "Bypass".to_string(),
        "-Command".to_string(), script,
    ];
    match run_powershell(&args) {
        Ok(output) => {
            if output.status.success() {
                json!({ "ok": true })
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                response(
                    false,
                    "OPEN_FAILED",
                    if stderr.is_empty() { "Falha ao abrir arquivo no Windows." } else { &stderr }
                )
            }
        }
        Err(err) => response(false, "OPEN_FAILED", &err.to_string()),
    }
}

fn pick_file(payload: &Value) -> Value {
    let allowed_extensions = normalize_extensions(payload.get("allowedExtensions"));
    let selection = open_native_picker(&allowed_extensions);
    if !selection.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        return selection;
    }
    let selected_path = selection.get("selectedPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let extension = get_file_extension(&selected_path);
    if !allowed_extensions.contains(&extension) {
        return response(false, "INVALID_EXTENSION", "Extensão não permitida.");
    }
    let prefer_unc = payload.get("preferUnc").and_then(|v| v.as_bool()).unwrap_or(true);
    let unc_path = to_unc_path(&selected_path);
    let final_path = if prefer_unc && !unc_path.is_empty() { unc_path.clone() } else { selected_path.clone() };
    let file_url = to_file_url(&final_path);
    if file_url.is_empty() {
        return response(false, "INVALID_PATH", "Caminho inválido para URL file://.");
    }
    json!({
        "ok": true,
        "fileName": Path::new(&selected_path).file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "extension": extension,
        "pathWindows": selected_path,
        "pathUnc": if unc_path.is_empty() { "".to_string() } else { unc_path },
        "fileUrl": file_url,
        "isNetworkPath": is_unc_path(&final_path)
    })
}

fn open_file(payload: &Value) -> Value {
    let allowed_extensions = normalize_extensions(payload.get("allowedExtensions"));
    let file_url = payload.get("fileUrl").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if file_url.is_empty() {
        return response(false, "INVALID_FILE_URL", "URL de arquivo ausente.");
    }
    if has_corrupted_utf8_marker(&file_url) {
        return response(
            false,
            "CORRUPTED_FILE_URL",
            "Link de arquivo com caracteres inválidos. Reanexe o arquivo pelo seletor nativo."
        );
    }
    let file_path = file_url_to_windows_path(&file_url);
    if file_path.is_empty() {
        return response(false, "INVALID_FILE_URL", "URL file:// inválida.");
    }
    if has_corrupted_utf8_marker(&file_path) {
        return response(
            false,
            "CORRUPTED_FILE_PATH",
            "Caminho de arquivo com caracteres inválidos. Reanexe o arquivo pelo seletor nativo."
        );
    }
    let extension = get_file_extension(&file_path);
    if !allowed_extensions.contains(&extension) {
        return response(false, "INVALID_EXTENSION", "Extensão não permitida.");
    }
    let opened = open_windows_path(&file_path);
    if !opened.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        return opened;
    }
    json!({
        "ok": true,
        "pathWindows": file_path,
        "extension": extension,
        "isNetworkPath": is_unc_path(&file_path)
    })
}

fn get_windows_user() -> Value {
    let user_name = env::var("USERNAME").unwrap_or_default().trim().to_string();
    let user_domain = env::var("USERDOMAIN").unwrap_or_default().trim().to_string();
    if user_name.is_empty() {
        return response(false, "WINDOWS_USER_UNAVAILABLE", "Usuário do Windows indisponível.");
    }
    let display_name = if user_domain.is_empty() {
        user_name.clone()
    } else {
        format!("{}\\{}", user_domain, user_name)
    };
    json!({
        "ok": true,
        "userName": user_name,
        "userDomain": user_domain,
        "displayName": display_name
    })
}

fn handle_message(message: &Value) -> Value {
    if !message.is_object() {
        return response(false, "INVALID_REQUEST", "Mensagem inválida.");
    }
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if action == "pickFile" {
        return pick_file(message);
    }
    if action == "openFile" {
        return open_file(message);
    }
    if action == "getWindowsUser" {
        return get_windows_user();
    }
    response(false, "UNKNOWN_ACTION", "Ação não suportada.")
}

fn write_native_message(payload: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| b"{\"ok\":false,\"code\":\"HOST_ERROR\",\"message\":\"Falha no host nativo.\"}".to_vec());
    let len = body.len() as u32;
    let header = len.to_le_bytes();
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle.write_all(&header)?;
    handle.write_all(&body)?;
    handle.flush()
}

fn main() {
    let stdin = io::stdin();
    let mut input = stdin.lock();
    loop {
        let mut header = [0u8; 4];
        match input.read_exact(&mut header) {
            Ok(_) => {}
            Err(err) => {
                if err.kind() == io::ErrorKind::UnexpectedEof {
                    break;
                }
                let _ = write_native_message(&response(false, "HOST_ERROR", &err.to_string()));
                break;
            }
        }
        let length = u32::from_le_bytes(header) as usize;
        let mut body = vec![0u8; length];
        if let Err(err) = input.read_exact(&mut body) {
            let _ = write_native_message(&response(false, "HOST_ERROR", &err.to_string()));
            break;
        }
        let parsed: Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => {
                let _ = write_native_message(&response(false, "INVALID_JSON", "JSON inválido."));
                continue;
            }
        };
        let result = std::panic::catch_unwind(|| handle_message(&parsed))
            .unwrap_or_else(|_| response(false, "HOST_ERROR", "Falha no host nativo."));
        let _ = write_native_message(&result);
    }
}
