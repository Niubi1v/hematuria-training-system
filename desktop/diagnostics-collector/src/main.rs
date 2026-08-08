#![cfg_attr(windows, windows_subsystem = "windows")]

use serde_json::{json, Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Seek, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

const SCHEMA: u32 = 1;
const TARGET_HEAD: &str = "28e342d878999d71fc840808dd77437b3c817893";
const R5: &str = "MentorLocalAI-R5";
const R4: &str = "MentorLocalAI-FinalCandidate";
const EXES: &[&str] = &["hematuria-training-r5.exe", "HematuriaTraining-R5.exe"];
const SAFE_FIELDS: &[&str] = &[
    "event",
    "status",
    "code",
    "category",
    "durationMs",
    "pid",
    "port",
    "phase",
    "exitCode",
    "schemaVersion",
];
const FILES: &[&str] = &[
    "diagnostic-summary.json",
    "system-summary.json",
    "product-summary.json",
    "resource-summary.json",
    "sqlite-summary.json",
    "startup-summary.json",
    "process-port-summary.json",
    "security-event-summary.json",
    "redacted-log-tail.txt",
    "README.txt",
];

#[derive(Clone)]
struct Inputs {
    exe_dir: PathBuf,
    local: Option<PathBuf>,
    profile: Option<PathBuf>,
    temp: PathBuf,
    programs: Vec<PathBuf>,
    registry: Option<String>,
    no_commands: bool,
}
impl Inputs {
    fn production() -> Result<Self, String> {
        let exe = env::current_exe().map_err(|_| "collector_executable_path_unavailable")?;
        Ok(Self {
            exe_dir: exe.parent().unwrap_or(Path::new(".")).into(),
            local: env::var_os("LOCALAPPDATA").map(Into::into),
            profile: env::var_os("USERPROFILE").map(Into::into),
            temp: env::temp_dir(),
            programs: ["ProgramFiles", "ProgramFiles(x86)"]
                .iter()
                .filter_map(|v| env::var_os(v).map(Into::into))
                .collect(),
            registry: None,
            no_commands: false,
        })
    }
    fn roots(&self, app: Option<&Path>) -> Vec<(&'static str, PathBuf)> {
        let mut v = Vec::new();
        if let Some(p) = &self.local {
            v.push(("%LOCALAPPDATA%", p.clone()))
        }
        if let Some(p) = &self.profile {
            v.push(("%USERPROFILE%", p.clone()))
        }
        v.push(("%TEMP%", self.temp.clone()));
        for p in &self.programs {
            v.push(("%PROGRAMFILES%", p.clone()))
        }
        if let Some(p) = app {
            v.push(("<APP_ROOT>", p.into()))
        }
        v
    }
}
#[derive(Default)]
struct Product {
    root: Option<PathBuf>,
    exe: Option<PathBuf>,
    mode: &'static str,
    version: Option<String>,
    identity: Option<String>,
}
struct Bundle {
    folder: PathBuf,
    zip: Option<PathBuf>,
    partial: bool,
}

fn main() {
    message(
        "R5一键诊断工具",
        "正在收集R5诊断信息。单击“确定”后请稍候。\n\n工具只读，不会启动R5或修改训练记录。",
        false,
    );
    match Inputs::production().and_then(|i| collect(&i, None)) {
        Ok(b) => {
            let p = b.zip.as_ref().unwrap_or(&b.folder);
            select(p);
            let t = if b.partial {
                "部分诊断项目无法读取，但已生成可用诊断包"
            } else {
                "诊断完成"
            };
            message(
                "R5诊断完成",
                &format!(
                    "{t}：\n{}\n\n请将诊断包和错误截图发送给维护人员。诊断包不包含患者问答或密钥。",
                    p.display()
                ),
                false,
            )
        }
        Err(e) => message(
            "R5诊断未完成",
            &format!("无法创建诊断文件：{e}\n\n请将此截图发送给维护人员。"),
            true,
        ),
    }
}

fn collect(i: &Inputs, forced: Option<&Path>) -> Result<Bundle, String> {
    let product = discover(i);
    let app = product.root.as_deref();
    let roots = i.roots(app);
    let data = i
        .local
        .as_ref()
        .map(|p| p.join("HematuriaTraining").join(R5));
    let r4 = i
        .local
        .as_ref()
        .map(|p| p.join("HematuriaTraining").join(R4));
    let root = forced.map(Into::into).unwrap_or_else(|| output_root(i));
    fs::create_dir_all(&root).map_err(|_| "diagnostic_output_root_unavailable")?;
    let stem = format!("Hematuria-R5-Diagnostic-{}", compact_time());
    let folder = unique(&root, &stem, "");
    fs::create_dir(&folder).map_err(|_| "diagnostic_output_directory_failed")?;
    let manifest = runtime_manifest(app);
    let system = system(i);
    let prod = product_json(&product, app, &roots);
    let resources = resources(app, data.as_deref(), manifest.as_ref(), &roots);
    let sqlite = sqlite(data.as_deref(), &roots);
    let (startup, log) = startup(data.as_deref());
    let process = processes(i);
    let security = security(i);
    let partial = [
        &system, &prod, &resources, &sqlite, &startup, &process, &security,
    ]
    .iter()
    .any(|v| {
        matches!(
            v["status"].as_str(),
            Some("unavailable" | "access_denied" | "invalid")
        )
    });
    let summary = json!({"schemaVersion":SCHEMA,"targetProductHead":TARGET_HEAD,"collectorBuildHead":build_head(),"generatedAt":utc_time(),"overallStatus":if partial{"partial"}else{"ok"},"applicationInstallation":prod["status"],"dataIsolation":{"r5Directory":dir_state(data.as_deref(),&roots),"r4Directory":dir_state(r4.as_deref(),&roots),"r4ReadOnly":true,"mutationPerformed":false},"networkRequests":0,"processesStarted":[],"notes":["read_only_evidence_collection","missing_items_do_not_block_output"]});
    for (name, value) in [
        ("diagnostic-summary.json", summary),
        ("system-summary.json", system),
        ("product-summary.json", prod),
        ("resource-summary.json", resources),
        ("sqlite-summary.json", sqlite),
        ("startup-summary.json", startup),
        ("process-port-summary.json", process),
        ("security-event-summary.json", security),
    ] {
        write_json(&folder.join(name), &value)?
    }
    write_new(&folder.join("redacted-log-tail.txt"), log.as_bytes())?;
    write_new(&folder.join("README.txt"), readme().as_bytes())?;
    if let Err(error) = manifest_file(&folder) {
        let _ = write_new(&folder.join("collector-error.txt"), error.as_bytes());
        return Err(error);
    }
    let z = unique(&root, &stem, ".zip");
    let zip = zip_dir(&folder, &z).ok().map(|_| z);
    Ok(Bundle {
        folder,
        zip,
        partial,
    })
}
fn build_head() -> &'static str {
    option_env!("HEMATURIA_COLLECTOR_BUILD_HEAD").unwrap_or("collector-head-unavailable")
}
fn output_root(i: &Inputs) -> PathBuf {
    for p in [
        i.profile.as_ref().map(|x| x.join("Desktop")),
        Some(i.exe_dir.clone()),
        Some(i.temp.join("HematuriaTraining/R5-Diagnostics")),
    ]
    .into_iter()
    .flatten()
    {
        if fs::create_dir_all(&p).is_ok() {
            return p;
        }
    }
    i.temp.clone()
}
fn unique(root: &Path, stem: &str, suffix: &str) -> PathBuf {
    let p = root.join(format!("{stem}{suffix}"));
    if !p.exists() {
        return p;
    }
    (1..10000)
        .map(|n| root.join(format!("{stem}-{n}{suffix}")))
        .find(|p| !p.exists())
        .unwrap_or(p)
}

fn discover(i: &Inputs) -> Product {
    for base in [Some(i.exe_dir.as_path()), i.exe_dir.parent()]
        .into_iter()
        .flatten()
    {
        if let Some(exe) = find_exe(base, 2) {
            let root = exe.parent().map(Into::into);
            if root.as_deref().is_some_and(has_resources) {
                return Product {
                    root,
                    exe: Some(exe),
                    mode: "portable",
                    ..Default::default()
                };
            }
        }
    }
    let text = i.registry.clone().unwrap_or_else(|| {
        if i.no_commands {
            String::new()
        } else {
            registry_query()
        }
    });
    for r in registry_records(&text) {
        let display = r.get("displayname").map(String::as_str).unwrap_or("");
        let id = r.get("identity").map(String::as_str).unwrap_or("");
        if (!display.eq_ignore_ascii_case("Hematuria Training System R5")
            && !id.eq_ignore_ascii_case("cn.hematuria.training.desktop.r5"))
            || r.values().any(|v| v.contains(R4))
        {
            continue;
        }
        let root = r.get("installlocation").map(PathBuf::from).or_else(|| {
            r.get("uninstallstring")
                .and_then(|value| uninstall_parent(value))
        });
        let Some(root) = root else {
            continue;
        };
        let exe = EXES.iter().map(|n| root.join(n)).find(|p| p.is_file());
        return Product {
            root: Some(root),
            exe,
            mode: "nsis",
            version: r.get("displayversion").cloned(),
            identity: Some(if id.is_empty() {
                display.into()
            } else {
                id.into()
            }),
        };
    }
    let mut standard = Vec::new();
    if let Some(local) = &i.local {
        standard.push(local.join("Hematuria Training System R5"));
        standard.push(local.join("Programs/Hematuria Training System R5"));
    }
    for root in &i.programs {
        standard.push(root.join("Hematuria Training System R5"));
    }
    for root in standard {
        if let Some(exe) = EXES
            .iter()
            .map(|name| root.join(name))
            .find(|path| path.is_file())
        {
            if has_resources(&root) {
                return Product {
                    root: Some(root),
                    exe: Some(exe),
                    mode: "nsis",
                    ..Default::default()
                };
            }
        }
    }
    Product {
        mode: "unknown",
        ..Default::default()
    }
}

fn uninstall_parent(value: &str) -> Option<PathBuf> {
    let cleaned = value.trim().trim_matches('"');
    let executable = cleaned.split(".exe").next()?;
    Path::new(&format!("{executable}.exe"))
        .parent()
        .map(Path::to_path_buf)
}
fn find_exe(root: &Path, depth: usize) -> Option<PathBuf> {
    for n in EXES {
        let p = root.join(n);
        if p.is_file() {
            return Some(p);
        }
    }
    if depth == 0 {
        return None;
    }
    for e in fs::read_dir(root).ok()?.flatten().take(200) {
        if e.path().is_dir() {
            if let Some(p) = find_exe(&e.path(), depth - 1) {
                return Some(p);
            }
        }
    }
    None
}
fn resource_root(root: &Path) -> Option<PathBuf> {
    [root.join("resources"), root.into()]
        .into_iter()
        .find(|p| p.join("app/desktop/runtime-manifest.json").is_file())
}
fn has_resources(root: &Path) -> bool {
    resource_root(root).is_some()
}
fn registry_query() -> String {
    [
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ]
    .iter()
    .filter_map(|k| run("reg.exe", &["query", k, "/s"]).ok())
    .collect::<Vec<_>>()
    .join("\n")
}
fn registry_records(text: &str) -> Vec<BTreeMap<String, String>> {
    let mut out = Vec::new();
    let mut r = BTreeMap::new();
    for l in text.lines() {
        let t = l.trim();
        if t.starts_with("HKEY_") {
            if !r.is_empty() {
                out.push(r);
                r = BTreeMap::new()
            }
            r.insert("key".into(), t.into());
            continue;
        }
        let p: Vec<_> = t.split_whitespace().collect();
        if p.len() >= 3 && p[1].starts_with("REG_") {
            r.insert(p[0].to_ascii_lowercase(), p[2..].join(" "));
        }
    }
    if !r.is_empty() {
        out.push(r)
    }
    out
}
fn runtime_manifest(app: Option<&Path>) -> Option<Value> {
    let p = resource_root(app?)?.join("app/desktop/runtime-manifest.json");
    serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
}

fn product_json(p: &Product, app: Option<&Path>, roots: &[(&str, PathBuf)]) -> Value {
    let exe = p.exe.as_deref();
    let detected = exe
        .and_then(|x| contains(x, TARGET_HEAD.as_bytes()).ok())
        .filter(|v| *v)
        .map(|_| TARGET_HEAD);
    let manifest = app
        .and_then(resource_root)
        .map(|r| r.join("app/desktop/runtime-manifest.json"));
    json!({"schemaVersion":SCHEMA,"status":if exe.is_some_and(Path::is_file){"ok"}else{"not_found"},"targetProductHead":TARGET_HEAD,"detectedProductHead":detected,"productHeadMatch":detected==Some(TARGET_HEAD),"version":p.version,"productIdentity":if app.is_some_and(has_resources){"hematuria-training-r5"}else{"unknown"},"installationMode":p.mode,"applicationPath":redact(exe,roots),"applicationSha256":exe.and_then(|x|sha256(x).ok()),"installerIdentity":p.identity,"resourceManifest":redact(manifest.as_deref(),roots)})
}
fn resources(
    app: Option<&Path>,
    data: Option<&Path>,
    m: Option<&Value>,
    roots: &[(&str, PathBuf)],
) -> Value {
    let rr = app.and_then(resource_root);
    let node = rr.as_ref().map(|r| r.join("runtime/node/node.exe"));
    let sidecar = rr.as_ref().map(|r| r.join("app/desktop/sidecar/index.cjs"));
    let llama = rr
        .as_ref()
        .map(|r| r.join("runtime/llama/llama-server.exe"));
    let rm = rr
        .as_ref()
        .map(|r| r.join("app/desktop/runtime-manifest.json"));
    let model = data.map(|r| r.join("models/Qwen3-1.7B-Q4_K_M.gguf"));
    let lf = m
        .and_then(|v| v.pointer("/llamaCpp/files")?.as_array())
        .and_then(|a| a.iter().find(|x| x["path"] == "llama-server.exe"));
    let items = vec![
        fact("application_resources", rr.as_deref(), None, None, roots),
        fact(
            "bundled_node",
            node.as_deref(),
            m.and_then(|v| v.pointer("/node/size")?.as_u64()),
            m.and_then(|v| v.pointer("/node/sha256")?.as_str()),
            roots,
        ),
        fact("sidecar_index", sidecar.as_deref(), None, None, roots),
        fact(
            "llama_server",
            llama.as_deref(),
            lf.and_then(|v| v["size"].as_u64()),
            lf.and_then(|v| v["sha256"].as_str()),
            roots,
        ),
        fact("runtime_manifest", rm.as_deref(), None, None, roots),
        fact("model_manifest", rm.as_deref(), None, None, roots),
        fact(
            "qwen_model",
            model.as_deref(),
            m.and_then(|v| v.pointer("/model/size")?.as_u64()),
            m.and_then(|v| v.pointer("/model/sha256")?.as_str()),
            roots,
        ),
    ];
    json!({"schemaVersion":SCHEMA,"status":if rr.is_none(){"not_found"}else if m.is_none(){"invalid"}else{"ok"},"resources":items})
}
fn fact(
    name: &str,
    p: Option<&Path>,
    size: Option<u64>,
    hash: Option<&str>,
    roots: &[(&str, PathBuf)],
) -> Value {
    let meta = p.and_then(|x| fs::metadata(x).ok());
    let present = meta.is_some();
    let actual = if present && hash.is_some() {
        p.and_then(|x| sha256(x).ok())
    } else {
        None
    };
    json!({"name":name,"status":if present{"ok"}else{"not_found"},"path":redact(p,roots),"present":present,"size":meta.as_ref().map(fs::Metadata::len),"shaStatus":if !present{"not_found"}else if hash.is_none(){"not_checked"}else if actual.as_deref()==hash{"match"}else{"mismatch"},"expectedMatch":size.is_none_or(|s|meta.as_ref().map(fs::Metadata::len)==Some(s))&&hash.is_none_or(|h|actual.as_deref()==Some(h))})
}
fn dir_state(p: Option<&Path>, roots: &[(&str, PathBuf)]) -> Value {
    let exists = p.is_some_and(Path::is_dir);
    json!({"status":if exists{"ok"}else{"not_found"},"exists":exists,"accessible":exists,"path":redact(p,roots),"readOnlyInspection":true})
}

fn sqlite(data: Option<&Path>, roots: &[(&str, PathBuf)]) -> Value {
    let db = data.map(|p| p.join("hematuria.sqlite3"));
    let wal = data.map(|p| p.join("hematuria.sqlite3-wal"));
    let shm = data.map(|p| p.join("hematuria.sqlite3-shm"));
    let mut head = [0u8; 16];
    let opened = db
        .as_ref()
        .and_then(|p| File::open(p).ok())
        .and_then(|mut f| f.read_exact(&mut head).ok());
    let present = db.as_ref().is_some_and(|p| p.is_file());
    let valid = opened.is_some() && &head == b"SQLite format 3\0";
    json!({"schemaVersion":SCHEMA,"status":if !present{"not_found"}else if opened.is_none(){"access_denied"}else if !valid{"invalid"}else{"ok"},"database":{"path":redact(db.as_deref(),roots),"present":present,"size":db.as_ref().and_then(|p|fs::metadata(p).ok()).map(|m|m.len()),"readOnlyOpen":opened.is_some(),"headerValid":valid},"walPresent":wal.as_ref().is_some_and(|p|p.is_file()),"shmPresent":shm.as_ref().is_some_and(|p|p.is_file()),"logsPresent":data.is_some_and(|p|p.join("logs").is_dir()),"exportsPresent":data.is_some_and(|p|p.join("exports").is_dir()),"schemaInspection":"unavailable","writeAccess":"unknown_not_mutated","mutationPerformed":false})
}
fn startup(data: Option<&Path>) -> (Value, String) {
    let Some(p) = data
        .map(|x| x.join("logs/sidecar-current.log"))
        .filter(|p| p.is_file())
    else {
        return (
            json!({"schemaVersion":SCHEMA,"status":"not_found","events":[],"stableFailureCodes":[]}),
            String::new(),
        );
    };
    let Ok(f) = File::open(p) else {
        return (
            json!({"schemaVersion":SCHEMA,"status":"access_denied","events":[],"stableFailureCodes":[]}),
            String::new(),
        );
    };
    let mut events = Vec::new();
    let mut codes = BTreeSet::<String>::new();
    for line in BufReader::new(f).lines().map_while(Result::ok).take(20000) {
        let Ok(Value::Object(o)) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let mut safe = Map::new();
        for k in SAFE_FIELDS {
            if let Some(v) = o.get(*k).filter(|v| safe_scalar(v)) {
                safe.insert((*k).into(), v.clone());
            }
        }
        if let Some(c) = safe.get("code").and_then(Value::as_str) {
            codes.insert(c.into());
        }
        if !safe.is_empty() {
            events.push(Value::Object(safe))
        }
    }
    if events.len() > 200 {
        events.drain(..events.len() - 200);
    }
    let text = events
        .iter()
        .filter_map(|v| serde_json::to_string(v).ok())
        .collect::<Vec<_>>()
        .join("\n");
    (
        json!({"schemaVersion":SCHEMA,"status":"ok","events":events,"stableFailureCodes":codes,"runtimeNotCreatedEvidence":codes.contains("RUNTIME_NOT_CREATED"),"collection":"structured_allowlist_only"}),
        if text.is_empty() {
            text
        } else {
            format!("{text}\n")
        },
    )
}
fn safe_scalar(v: &&Value) -> bool {
    match v {
        Value::Null | Value::Bool(_) | Value::Number(_) => true,
        Value::String(s) => {
            s.len() <= 120
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
        }
        _ => false,
    }
}

fn system(i: &Inputs) -> Value {
    let q = |key, name| {
        if i.no_commands {
            None
        } else {
            run("reg.exe", &["query", key, "/v", name])
                .ok()
                .and_then(|t| reg_value(&t, name))
        }
    };
    let web = if i.no_commands {
        None
    } else {
        run("reg.exe",&["query",r"HKLM\Software\Microsoft\EdgeUpdate\Clients\{F1E7E92A-58EE-4B71-A6CC-5D3E81C55D77}","/v","pv"]).ok().and_then(|t|reg_value(&t,"pv"))
    };
    let (avail, total) = memory();
    let admin = !i.no_commands
        && run("whoami.exe", &["/groups"])
            .is_ok_and(|t| t.contains("S-1-16-12288") || t.contains("S-1-16-16384"));
    json!({"schemaVersion":SCHEMA,"status":"ok","windows":q(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion","ProductName"),"build":q(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion","CurrentBuildNumber"),"architecture":env::consts::ARCH,"accountType":if admin{"administrator_elevated"}else{"standard_or_not_elevated"},"locale":q(r"HKCU\Control Panel\International","LocaleName"),"webView2":{"available":web.is_some(),"version":web},"physicalMemory":{"availableBytes":avail,"totalBytes":total},"generatedAt":utc_time()})
}
fn reg_value(text: &str, name: &str) -> Option<String> {
    text.lines().find_map(|l| {
        let p: Vec<_> = l.split_whitespace().collect();
        (p.len() >= 3 && p[0].eq_ignore_ascii_case(name)).then(|| p[2..].join(" "))
    })
}
#[cfg(windows)]
fn memory() -> (Option<u64>, Option<u64>) {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut m = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..unsafe { std::mem::zeroed() }
    };
    if unsafe { GlobalMemoryStatusEx(&mut m) } != 0 {
        (Some(m.ullAvailPhys), Some(m.ullTotalPhys))
    } else {
        (None, None)
    }
}
#[cfg(not(windows))]
fn memory() -> (Option<u64>, Option<u64>) {
    (None, None)
}

fn processes(i: &Inputs) -> Value {
    if i.no_commands {
        return json!({"schemaVersion":SCHEMA,"status":"unavailable","processes":[],"listeners":[]});
    }
    let tasks = run("tasklist.exe", &["/FO", "CSV", "/NH"]);
    let ports = run("netstat.exe", &["-ano", "-p", "tcp"]);
    let mut ps = Vec::new();
    let mut ids = BTreeSet::new();
    if let Ok(t) = &tasks {
        for l in t.lines() {
            let c = csv(l);
            if c.len() < 2 {
                continue;
            }
            let image = c[0].to_ascii_lowercase();
            let kind = if EXES.iter().any(|n| image == n.to_ascii_lowercase()) {
                Some("r5_application")
            } else if image == "llama-server.exe" {
                Some("llama_server_candidate")
            } else if image == "node.exe" {
                Some("node_candidate_unscoped")
            } else if image == "msedgewebview2.exe" {
                Some("webview2_candidate_unscoped")
            } else {
                None
            };
            if let (Some(k), Ok(pid)) = (kind, c[1].parse::<u32>()) {
                ids.insert(pid);
                ps.push(json!({"processType":k,"pid":pid,"state":"running"}))
            }
        }
    }
    let mut listeners = Vec::new();
    if let Ok(t) = &ports {
        for l in t.lines() {
            let p: Vec<_> = l.split_whitespace().collect();
            if p.len() < 5 || !p[0].eq_ignore_ascii_case("TCP") || p[3] != "LISTENING" {
                continue;
            }
            let Ok(pid) = p[4].parse() else { continue };
            if ids.contains(&pid) && p[1].starts_with("127.0.0.1:") {
                if let Some(port) = p[1].rsplit(':').next().and_then(|x| x.parse::<u16>().ok()) {
                    listeners
                        .push(json!({"host":"127.0.0.1","port":port,"pid":pid,"state":"listening"}))
                }
            }
        }
    }
    json!({"schemaVersion":SCHEMA,"status":if tasks.is_err()&&ports.is_err(){"unavailable"}else{"ok"},"processes":ps,"listeners":listeners,"commandLinesCollected":false})
}
fn csv(s: &str) -> Vec<String> {
    let (mut out, mut field, mut quote) = (Vec::new(), String::new(), false);
    let mut ch = s.chars().peekable();
    while let Some(c) = ch.next() {
        match c {
            '"' if quote && ch.peek() == Some(&'"') => {
                field.push('"');
                ch.next();
            }
            '"' => quote = !quote,
            ',' if !quote => out.push(std::mem::take(&mut field)),
            _ => field.push(c),
        }
    }
    out.push(field);
    out
}
fn security(i: &Inputs) -> Value {
    if i.no_commands {
        return json!({"schemaVersion":SCHEMA,"status":"unavailable","events":[]});
    }
    let mut events = Vec::new();
    let mut any = false;
    for (log, q) in [
        ("Application", "*[System[(EventID=1000 or EventID=1001)]]"),
        (
            "Microsoft-Windows-Windows Defender/Operational",
            "*[System[(EventID=1116 or EventID=1117)]]",
        ),
    ] {
        let Ok(xml) = run(
            "wevtutil.exe",
            &["qe", log, &format!("/q:{q}"), "/f:xml", "/rd:true", "/c:20"],
        ) else {
            continue;
        };
        any = true;
        for e in xml.split("<Event ").skip(1) {
            let l = e.to_ascii_lowercase();
            if !l.contains("hematuria") && !l.contains("llama-server") && !l.contains("webview2") {
                continue;
            }
            events.push(json!({"timestamp":attribute(e,"SystemTime"),"eventId":element(e,"EventID"),"source":attribute(e,"Name"),"summary":"r5_related_event_metadata_only"}))
        }
    }
    json!({"schemaVersion":SCHEMA,"status":if any{"ok"}else{"unavailable"},"events":events})
}
fn element(t: &str, n: &str) -> Option<String> {
    let s = t.find(&format!("<{n}>"))? + n.len() + 2;
    let e = t[s..].find(&format!("</{n}>"))? + s;
    Some(
        t[s..e]
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || "_.:-+".contains(*c))
            .take(80)
            .collect(),
    )
}
fn attribute(t: &str, n: &str) -> Option<String> {
    let m = format!("{n}=\"");
    let s = t.find(&m)? + m.len();
    let e = t[s..].find('"')? + s;
    Some(
        t[s..e]
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || "_.:-+".contains(*c))
            .take(120)
            .collect(),
    )
}
fn run(program: &str, args: &[&str]) -> Result<String, ()> {
    let mut c = Command::new(program);
    c.args(args).stdin(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    let o = c.output().map_err(|_| ())?;
    if !o.status.success() {
        return Err(());
    }
    Ok(String::from_utf8_lossy(&o.stdout).into())
}

fn redact(p: Option<&Path>, roots: &[(&str, PathBuf)]) -> String {
    let Some(p) = p else { return String::new() };
    for (label, root) in roots {
        if let Ok(r) = p.strip_prefix(root) {
            return if r.as_os_str().is_empty() {
                (*label).into()
            } else {
                format!("{label}\\{}", r.display())
            };
        }
    }
    format!(
        "<redacted>\\{}",
        p.file_name().and_then(OsStr::to_str).unwrap_or("item")
    )
}
fn contains(p: &Path, n: &[u8]) -> Result<bool, ()> {
    let mut f = File::open(p).map_err(|_| ())?;
    let mut b = vec![0; 1024 * 1024 + n.len()];
    let mut carry = 0;
    loop {
        let read = f.read(&mut b[carry..]).map_err(|_| ())?;
        if read == 0 {
            return Ok(false);
        }
        let used = carry + read;
        if b[..used].windows(n.len()).any(|w| w == n) {
            return Ok(true);
        }
        carry = n.len().saturating_sub(1).min(used);
        b.copy_within(used - carry..used, 0)
    }
}

#[cfg(windows)]
fn sha256(p: &Path) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::*;
    let mut alg: BCRYPT_ALG_HANDLE = std::ptr::null_mut();
    if unsafe {
        BCryptOpenAlgorithmProvider(&mut alg, BCRYPT_SHA256_ALGORITHM, std::ptr::null(), 0)
    } != 0
    {
        return Err("sha256_provider_failed".into());
    }
    let (mut len, mut wrote) = (0u32, 0u32);
    if unsafe {
        BCryptGetProperty(
            alg as _,
            BCRYPT_OBJECT_LENGTH,
            (&mut len as *mut u32).cast(),
            4,
            &mut wrote,
            0,
        )
    } != 0
    {
        unsafe { BCryptCloseAlgorithmProvider(alg, 0) };
        return Err("sha256_property_failed".into());
    }
    let mut object = vec![0; len as usize];
    let mut hash: BCRYPT_HASH_HANDLE = std::ptr::null_mut();
    if unsafe {
        BCryptCreateHash(
            alg,
            &mut hash,
            object.as_mut_ptr(),
            len,
            std::ptr::null(),
            0,
            0,
        )
    } != 0
    {
        unsafe { BCryptCloseAlgorithmProvider(alg, 0) };
        return Err("sha256_create_failed".into());
    }
    let result = (|| {
        let mut f = File::open(p).map_err(|_| "sha256_open_failed")?;
        let mut b = vec![0u8; 64 * 1024];
        loop {
            let n = f.read(&mut b).map_err(|_| "sha256_read_failed")?;
            if n == 0 {
                break;
            }
            if unsafe { BCryptHashData(hash, b.as_ptr(), n as u32, 0) } != 0 {
                return Err("sha256_update_failed");
            }
        }
        let mut d = [0u8; 32];
        if unsafe { BCryptFinishHash(hash, d.as_mut_ptr(), 32, 0) } != 0 {
            return Err("sha256_finish_failed");
        }
        Ok(d.iter().map(|x| format!("{x:02x}")).collect())
    })();
    unsafe {
        BCryptDestroyHash(hash);
        BCryptCloseAlgorithmProvider(alg, 0);
    }
    result.map_err(Into::into)
}
#[cfg(not(windows))]
fn sha256(_: &Path) -> Result<String, String> {
    Err("sha256_windows_only".into())
}

fn write_json(p: &Path, v: &Value) -> Result<(), String> {
    let mut b = serde_json::to_vec_pretty(v).map_err(|_| "json_serialize_failed")?;
    b.push(b'\n');
    write_new(p, &b)
}
fn write_new(p: &Path, b: &[u8]) -> Result<(), String> {
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)
        .map_err(|_| "diagnostic_file_create_failed")?;
    f.write_all(b).map_err(|_| "diagnostic_file_write_failed")?;
    f.sync_all()
        .map_err(|_| "diagnostic_file_sync_failed".into())
}
fn manifest_file(folder: &Path) -> Result<(), String> {
    let mut lines = Vec::new();
    for n in FILES {
        lines.push(format!("{} *{n}", sha256(&folder.join(n))?))
    }
    write_new(
        &folder.join("manifest.sha256"),
        format!("{}\n", lines.join("\n")).as_bytes(),
    )
}
fn zip_dir(folder: &Path, out: &Path) -> Result<(), String> {
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(out)
        .map_err(|_| "zip_create_failed")?;
    let mut central = Vec::new();
    for name in FILES
        .iter()
        .copied()
        .chain(std::iter::once("manifest.sha256"))
    {
        let d = fs::read(folder.join(name)).map_err(|_| "zip_source_failed")?;
        let off = f.stream_position().map_err(|_| "zip_seek_failed")? as u32;
        let crc = crc32(&d);
        u32w(&mut f, 0x04034b50)?;
        u16w(&mut f, 20)?;
        u16w(&mut f, 0x0800)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u32w(&mut f, crc)?;
        u32w(&mut f, d.len() as u32)?;
        u32w(&mut f, d.len() as u32)?;
        u16w(&mut f, name.len() as u16)?;
        u16w(&mut f, 0)?;
        f.write_all(name.as_bytes())
            .map_err(|_| "zip_write_failed")?;
        f.write_all(&d).map_err(|_| "zip_write_failed")?;
        central.push((name.as_bytes().to_vec(), crc, d.len() as u32, off));
    }
    let start = f.stream_position().map_err(|_| "zip_seek_failed")? as u32;
    for (n, crc, size, off) in &central {
        u32w(&mut f, 0x02014b50)?;
        u16w(&mut f, 20)?;
        u16w(&mut f, 20)?;
        u16w(&mut f, 0x0800)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u32w(&mut f, *crc)?;
        u32w(&mut f, *size)?;
        u32w(&mut f, *size)?;
        u16w(&mut f, n.len() as u16)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u16w(&mut f, 0)?;
        u32w(&mut f, 0)?;
        u32w(&mut f, *off)?;
        f.write_all(n).map_err(|_| "zip_write_failed")?;
    }
    let end = f.stream_position().map_err(|_| "zip_seek_failed")? as u32;
    u32w(&mut f, 0x06054b50)?;
    u16w(&mut f, 0)?;
    u16w(&mut f, 0)?;
    u16w(&mut f, central.len() as u16)?;
    u16w(&mut f, central.len() as u16)?;
    u32w(&mut f, end - start)?;
    u32w(&mut f, start)?;
    u16w(&mut f, 0)?;
    f.sync_all().map_err(|_| "zip_sync_failed".into())
}
fn u16w(f: &mut File, v: u16) -> Result<(), String> {
    f.write_all(&v.to_le_bytes())
        .map_err(|_| "zip_write_failed".into())
}
fn u32w(f: &mut File, v: u32) -> Result<(), String> {
    f.write_all(&v.to_le_bytes())
        .map_err(|_| "zip_write_failed".into())
}
fn crc32(b: &[u8]) -> u32 {
    let mut c = !0u32;
    for x in b {
        c ^= *x as u32;
        for _ in 0..8 {
            c = if c & 1 == 1 {
                (c >> 1) ^ 0xedb88320
            } else {
                c >> 1
            }
        }
    }
    !c
}
fn readme() -> String {
    "如果R5出现打不开、一直准备、模型无法启动、保存失败或其他异常：\r\n\r\n1. 完全关闭R5（如果能关闭）。\r\n2. 双击 Hematuria-R5-Diagnostics-Collector.exe。\r\n3. 等待提示诊断完成。\r\n4. 将生成的 Hematuria-R5-Diagnostic-*.zip 和错误截图发给维护人员。\r\n\r\n无需安装Node、Python或其他软件。\r\n无需管理员权限。\r\n不要关闭Windows安全中心。\r\n诊断包不会收集患者问答内容或访问凭据。\r\n".into()
}

fn parts() -> (i32, u32, u32, u32, u32, u32) {
    let s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (s / 86400) as i64;
    let ds = s % 86400;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    y += if m <= 2 { 1 } else { 0 };
    (
        y as i32,
        m as u32,
        d as u32,
        (ds / 3600) as u32,
        ((ds % 3600) / 60) as u32,
        (ds % 60) as u32,
    )
}
fn compact_time() -> String {
    let (y, m, d, h, n, s) = parts();
    format!("{y:04}{m:02}{d:02}-{h:02}{n:02}{s:02}")
}
fn utc_time() -> String {
    let (y, m, d, h, n, s) = parts();
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{n:02}:{s:02}Z")
}
#[cfg(windows)]
fn message(title: &str, text: &str, error: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let t: Vec<u16> = title.encode_utf16().chain(Some(0)).collect();
    let x: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            x.as_ptr(),
            t.as_ptr(),
            MB_OK
                | if error {
                    MB_ICONERROR
                } else {
                    MB_ICONINFORMATION
                },
        );
    }
}
#[cfg(not(windows))]
fn message(_: &str, _: &str, _: bool) {}
fn select(p: &Path) {
    let _ = Command::new("explorer.exe")
        .arg(format!("/select,{}", p.display()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root(tag: &str) -> PathBuf {
        let p = env::temp_dir().join(format!(
            "r5-diag-{tag}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn input(p: &Path) -> Inputs {
        Inputs {
            exe_dir: p.join("collector"),
            local: Some(p.join("local")),
            profile: Some(p.join("profile")),
            temp: p.join("temp"),
            programs: vec![p.join("programs")],
            registry: Some(String::new()),
            no_commands: true,
        }
    }
    fn db(p: &Path) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b"SQLite format 3\0fixture").unwrap()
    }
    fn portable(p: &Path) -> PathBuf {
        let app = p.join("portable");
        let r = app.join("resources");
        fs::create_dir_all(r.join("app/desktop/sidecar")).unwrap();
        fs::create_dir_all(r.join("runtime/node")).unwrap();
        fs::create_dir_all(r.join("runtime/llama")).unwrap();
        fs::write(app.join(EXES[0]), format!("exe-{TARGET_HEAD}")).unwrap();
        fs::write(r.join("app/desktop/sidecar/index.cjs"), b"fixture").unwrap();
        fs::write(r.join("runtime/node/node.exe"), b"node").unwrap();
        fs::write(r.join("runtime/llama/llama-server.exe"), b"llama").unwrap();
        let m = json!({"node":{"size":4,"sha256":sha256(&r.join("runtime/node/node.exe")).unwrap()},"llamaCpp":{"files":[{"path":"llama-server.exe","size":5,"sha256":sha256(&r.join("runtime/llama/llama-server.exe")).unwrap()}]},"model":{"size":5,"sha256":"0".repeat(64)}});
        fs::write(
            r.join("app/desktop/runtime-manifest.json"),
            serde_json::to_vec(&m).unwrap(),
        )
        .unwrap();
        app
    }
    fn entries(p: &Path) -> Vec<String> {
        let b = fs::read(p).unwrap();
        let e = b
            .windows(4)
            .rposition(|w| w == [0x50, 0x4b, 0x05, 0x06])
            .unwrap();
        let count = u16::from_le_bytes(b[e + 10..e + 12].try_into().unwrap()) as usize;
        let mut o = u32::from_le_bytes(b[e + 16..e + 20].try_into().unwrap()) as usize;
        let mut v = Vec::new();
        for _ in 0..count {
            assert_eq!(&b[o..o + 4], &[0x50, 0x4b, 0x01, 0x02]);
            let n = u16::from_le_bytes(b[o + 28..o + 30].try_into().unwrap()) as usize;
            let x = u16::from_le_bytes(b[o + 30..o + 32].try_into().unwrap()) as usize;
            let c = u16::from_le_bytes(b[o + 32..o + 34].try_into().unwrap()) as usize;
            v.push(String::from_utf8(b[o + 46..o + 46 + n].to_vec()).unwrap());
            o += 46 + n + x + c
        }
        v
    }
    fn output_text(folder: &Path) -> String {
        FILES
            .iter()
            .chain(std::iter::once(&"manifest.sha256"))
            .filter_map(|name| fs::read(folder.join(name)).ok())
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
            .collect::<Vec<_>>()
            .join("\n")
    }
    #[test]
    fn case_01_app_closed() {
        let r = root("closed");
        assert!(collect(&input(&r), Some(&r.join("out")))
            .unwrap()
            .zip
            .unwrap()
            .is_file())
    }
    #[test]
    fn case_02_app_missing() {
        let r = root("missing");
        assert!(discover(&input(&r)).exe.is_none())
    }
    #[test]
    fn case_03_sidecar_never_started() {
        let r = root("nostart");
        assert_eq!(startup(Some(&r)).0["status"], "not_found")
    }
    #[test]
    fn case_04_model_missing() {
        let r = root("nomodel");
        assert!(resources(None, Some(&r), None, &[])["resources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["name"] == "qwen_model" && x["present"] == false))
    }
    #[test]
    fn case_05_model_present() {
        let r = root("model");
        fs::create_dir_all(r.join("models")).unwrap();
        fs::write(r.join("models/Qwen3-1.7B-Q4_K_M.gguf"), b"model").unwrap();
        assert!(resources(None, Some(&r), None, &[])["resources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| x["name"] == "qwen_model" && x["present"] == true))
    }
    #[test]
    fn case_06_sqlite_present() {
        let r = root("db");
        db(&r.join("hematuria.sqlite3"));
        assert_eq!(sqlite(Some(&r), &[])["status"], "ok")
    }
    #[test]
    fn case_07_sqlite_held_unchanged() {
        let r = root("held");
        let p = r.join("hematuria.sqlite3");
        db(&p);
        let _h = File::open(&p).unwrap();
        let a = fs::metadata(&p).unwrap();
        let _ = sqlite(Some(&r), &[]);
        let b = fs::metadata(&p).unwrap();
        assert_eq!(
            (a.len(), a.modified().unwrap()),
            (b.len(), b.modified().unwrap())
        )
    }
    #[test]
    fn case_08_sqlite_missing() {
        let r = root("nodb");
        assert_eq!(sqlite(Some(&r), &[])["status"], "not_found")
    }
    #[test]
    fn case_09_log_missing() {
        let r = root("nolog");
        assert_eq!(startup(Some(&r)).0["status"], "not_found")
    }
    #[test]
    fn case_10_structured_log() {
        let r = root("log");
        fs::create_dir_all(r.join("logs")).unwrap();
        fs::write(
            r.join("logs/sidecar-current.log"),
            r#"{"event":"ready","status":"ok","phase":"startup"}"#,
        )
        .unwrap();
        assert!(startup(Some(&r)).1.contains("ready"))
    }
    #[test]
    fn case_11_secrets_removed() {
        let r = root("secret");
        fs::create_dir_all(r.join("logs")).unwrap();
        fs::write(r.join("logs/sidecar-current.log"),r#"{"event":"ready","authToken":"FAKE-AUTH","bearer":"FAKE-BEARER","handshake":"FAKE-HANDSHAKE","stateToken":"FAKE-STATE"}"#).unwrap();
        let mut i = input(&r);
        i.local = Some(r.clone());
        let bundle = collect(&i, Some(&r.join("out"))).unwrap();
        assert!(!output_text(&bundle.folder).contains("FAKE-"))
    }
    #[test]
    fn case_12_patient_text_removed() {
        let r = root("patient");
        fs::create_dir_all(r.join("logs")).unwrap();
        fs::write(r.join("logs/sidecar-current.log"),r#"{"event":"reply","question":"FAKE-PATIENT-QUESTION","answer":"FAKE-PATIENT-ANSWER","message":"FAKE-MESSAGE"}"#).unwrap();
        let mut i = input(&r);
        i.local = Some(r.clone());
        let bundle = collect(&i, Some(&r.join("out"))).unwrap();
        let text = output_text(&bundle.folder);
        assert!(!text.contains("FAKE-PATIENT") && !text.contains("FAKE-MESSAGE"))
    }
    #[test]
    fn case_13_chinese_path() {
        let r = root("中文目录");
        assert!(collect(&input(&r), Some(&r.join("输出")))
            .unwrap()
            .folder
            .is_dir())
    }
    #[test]
    fn case_14_space_path() {
        let r = root("space path");
        assert!(collect(&input(&r), Some(&r.join("output path")))
            .unwrap()
            .folder
            .is_dir())
    }
    #[test]
    fn case_15_long_path() {
        let r = root("long").join("a".repeat(80)).join("b".repeat(80));
        fs::create_dir_all(&r).unwrap();
        assert!(collect(&input(&r), Some(&r.join("out")))
            .unwrap()
            .folder
            .is_dir())
    }
    #[test]
    fn case_16_security_unavailable() {
        let r = root("security");
        assert_eq!(security(&input(&r))["status"], "unavailable")
    }
    #[test]
    fn case_17_webview_unavailable() {
        let r = root("webview");
        assert_eq!(system(&input(&r))["webView2"]["available"], false)
    }
    #[test]
    fn case_18_portable_discovery() {
        let r = root("portable");
        let app = portable(&r);
        let mut i = input(&r);
        i.exe_dir = app;
        assert_eq!(discover(&i).mode, "portable")
    }
    #[test]
    fn case_19_nsis_rejects_r4() {
        let r = root("nsis");
        let mut i = input(&r);
        i.registry=Some(format!("HKEY_CURRENT_USER\\R4\n DisplayName REG_SZ Hematuria Training System R4\n InstallLocation REG_SZ {}\nHKEY_CURRENT_USER\\R5\n DisplayName REG_SZ Hematuria Training System R5\n InstallLocation REG_SZ {}\n DisplayVersion REG_SZ 0.5.0",r.join(R4).display(),r.join(R5).display()));
        let p = discover(&i);
        assert_eq!(p.mode, "nsis");
        assert!(!p.root.unwrap().to_string_lossy().contains(R4))
    }
    #[test]
    fn case_20_all_missing_valid_zip() {
        let r = root("all");
        let b = collect(&input(&r), Some(&r.join("out"))).unwrap();
        let names = entries(&b.zip.unwrap());
        assert_eq!(names.len(), 11);
        assert!(names.iter().all(|n| !n.contains('\\')));
        let manifest = fs::read_to_string(b.folder.join("manifest.sha256")).unwrap();
        assert_eq!(manifest.lines().count(), 10);
        for line in manifest.lines() {
            let (digest, name) = line.split_once(" *").unwrap();
            assert_eq!(sha256(&b.folder.join(name)).unwrap(), digest);
        }
    }
}
