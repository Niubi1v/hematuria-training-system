use serde::{Deserialize, Serialize};
use std::{
    env,
    error::Error,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WebviewUrl};

const SIDECAR_PROTOCOL_VERSION: u32 = 1;
const SIDECAR_STARTUP_TIMEOUT: Duration = Duration::from_secs(150);
const SIDECAR_GRACEFUL_SHUTDOWN: Duration = Duration::from_secs(3);
const DESKTOP_ORIGINS: &str = "http://tauri.localhost,https://tauri.localhost,tauri://localhost";
const WINDOW_STATE_VERSION: u32 = 1;
const WINDOW_STATE_FILE: &str = "window-state-v1.json";
const MIN_WINDOW_WIDTH: u32 = 960;
const MIN_WINDOW_HEIGHT: u32 = 640;
const MAX_WINDOW_DIMENSION: u32 = 16_384;
const R4_DATA_DIRECTORY_NAME: &str = "MentorLocalAI-FinalCandidate";
const R5_DATA_DIRECTORY_NAME: &str = "MentorLocalAI-R5";
const R5_PRODUCT_IDENTITY: &str = "hematuria-training-r5";
const DIAGNOSTIC_SCHEMA_VERSION: u32 = 3;
const BOOTSTRAP_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadyMessage {
    event: String,
    protocol_version: u32,
    handshake: String,
    pid: u32,
    origin: String,
    database_schema_version: u32,
}

#[derive(Clone)]
struct RuntimeLayout {
    app_root: PathBuf,
    node: PathBuf,
    llama_server: Option<PathBuf>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeConfig {
    runtime_target: &'static str,
    api_base_url: String,
    auth_token: String,
    debug_runtime: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticFile {
    name: String,
    path: String,
    present: bool,
    size: Option<u64>,
    size_matches: bool,
    sha256_status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticFailure {
    category: String,
    code: String,
    phase: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupEvidence {
    setup_entered: bool,
    data_directory_resolved: bool,
    runtime_layout_resolved: bool,
    sidecar_spawned: bool,
    sidecar_ready: bool,
    runtime_config_available: bool,
    initialization_script_built: bool,
    runtime_injection_expected: bool,
    window_build_started: bool,
    window_built: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDiagnosticReport {
    schema_version: u32,
    product_identity: &'static str,
    product_version: String,
    product_head: String,
    runtime_target: &'static str,
    installation_mode: String,
    operating_system: serde_json::Value,
    standard_user: Option<bool>,
    paths: serde_json::Value,
    resources: Vec<DiagnosticFile>,
    processes: serde_json::Value,
    job_object: serde_json::Value,
    sidecar: serde_json::Value,
    sqlite: serde_json::Value,
    loopback: serde_json::Value,
    local_ai: serde_json::Value,
    startup: StartupEvidence,
    last_failure: Option<DiagnosticFailure>,
    stable_failure_codes: Vec<String>,
    data_isolation: serde_json::Value,
    recovery_suggestions: Vec<String>,
    generated_at: String,
}

#[derive(Clone, Default)]
struct RuntimeObservation {
    data_dir: Option<PathBuf>,
    layout: Option<RuntimeLayout>,
    runtime_config: Option<DesktopRuntimeConfig>,
    ready: Option<ReadyMessage>,
    sidecar_pid: Option<u32>,
    sidecar_exit_code: Option<i32>,
    last_failure: Option<DiagnosticFailure>,
    job_object_status: String,
    startup: StartupEvidence,
}

#[derive(Clone)]
struct RuntimeContext {
    layout: RuntimeLayout,
    data_dir: PathBuf,
    window_state_path: PathBuf,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedWindowState {
    version: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

impl PersistedWindowState {
    fn valid(&self) -> bool {
        self.version == WINDOW_STATE_VERSION
            && (MIN_WINDOW_WIDTH..=MAX_WINDOW_DIMENSION).contains(&self.width)
            && (MIN_WINDOW_HEIGHT..=MAX_WINDOW_DIMENSION).contains(&self.height)
            && self.x.unsigned_abs() <= 100_000
            && self.y.unsigned_abs() <= 100_000
    }
}

fn load_window_state(path: &Path) -> Result<Option<PersistedWindowState>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("desktop_window_state_read_failed".to_string()),
    };
    if bytes.len() > 4096 {
        return Err("desktop_window_state_too_large".to_string());
    }
    let state: PersistedWindowState =
        serde_json::from_slice(&bytes).map_err(|_| "desktop_window_state_invalid".to_string())?;
    if !state.valid() {
        return Err("desktop_window_state_invalid".to_string());
    }
    Ok(Some(state))
}

#[cfg(windows)]
fn replace_file_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    #[link(name = "Kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        return Err("desktop_window_state_replace_failed".to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(source, destination).map_err(|_| "desktop_window_state_replace_failed".to_string())
}

fn persist_window_state_atomic(path: &Path, state: &PersistedWindowState) -> Result<(), String> {
    if !state.valid() {
        return Err("desktop_window_state_invalid".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "desktop_window_state_parent_missing".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "desktop_window_state_directory_failed".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "desktop_window_state_clock_invalid".to_string())?
        .as_nanos();
    let temporary = parent.join(format!(
        ".{WINDOW_STATE_FILE}.tmp-{}-{nonce}",
        std::process::id()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| "desktop_window_state_temporary_open_failed".to_string())?;
        let payload = serde_json::to_vec(state)
            .map_err(|_| "desktop_window_state_serialize_failed".to_string())?;
        file.write_all(&payload)
            .map_err(|_| "desktop_window_state_write_failed".to_string())?;
        file.sync_all()
            .map_err(|_| "desktop_window_state_sync_failed".to_string())?;
        drop(file);
        replace_file_atomically(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn window_state_intersects_monitor<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    state: &PersistedWindowState,
) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    let window_left = i64::from(state.x);
    let window_top = i64::from(state.y);
    let window_right = window_left + i64::from(state.width);
    let window_bottom = window_top + i64::from(state.height);
    monitors.iter().any(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        let monitor_left = i64::from(position.x);
        let monitor_top = i64::from(position.y);
        let monitor_right = monitor_left + i64::from(size.width);
        let monitor_bottom = monitor_top + i64::from(size.height);
        window_left < monitor_right
            && window_right > monitor_left
            && window_top < monitor_bottom
            && window_bottom > monitor_top
    })
}

#[derive(Default)]
struct LifecycleState {
    sidecar: Mutex<Option<ManagedSidecar>>,
    window_state_path: Mutex<Option<PathBuf>>,
    observation: Mutex<RuntimeObservation>,
    prepare_lock: Mutex<()>,
}

impl LifecycleState {
    fn mark_startup(&self, update: impl FnOnce(&mut StartupEvidence)) {
        if let Ok(mut observation) = self.observation.lock() {
            update(&mut observation.startup);
        }
    }

    fn set_data_directory(
        &self,
        data_dir: PathBuf,
        window_state_path: PathBuf,
    ) -> Result<(), String> {
        let mut observation = self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?;
        observation.data_dir = Some(data_dir);
        drop(observation);
        *self
            .window_state_path
            .lock()
            .map_err(|_| "desktop_window_state_path_poisoned".to_string())? =
            Some(window_state_path);
        Ok(())
    }

    fn set_context(&self, context: RuntimeContext) -> Result<(), String> {
        let mut observation = self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?;
        observation.data_dir = Some(context.data_dir.clone());
        observation.layout = Some(context.layout);
        drop(observation);
        *self
            .window_state_path
            .lock()
            .map_err(|_| "desktop_window_state_path_poisoned".to_string())? =
            Some(context.window_state_path);
        Ok(())
    }

    fn install(
        &self,
        sidecar: ManagedSidecar,
        context: RuntimeContext,
        ready: ReadyMessage,
        bearer: String,
    ) -> Result<(), String> {
        let mut guard = self
            .sidecar
            .lock()
            .map_err(|_| "desktop_sidecar_state_poisoned".to_string())?;
        if guard.is_some() {
            return Err("desktop_sidecar_already_started".to_string());
        }
        *guard = Some(sidecar);
        self.set_context(context)?;
        let mut observation = self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?;
        observation.runtime_config = Some(DesktopRuntimeConfig {
            runtime_target: "desktop",
            api_base_url: ready.origin.clone(),
            auth_token: bearer,
            debug_runtime: cfg!(debug_assertions),
        });
        observation.ready = Some(ready);
        observation.sidecar_pid = observation.ready.as_ref().map(|value| value.pid);
        observation.sidecar_exit_code = None;
        observation.last_failure = None;
        observation.job_object_status = "ready".to_string();
        observation.startup.runtime_config_available = true;
        Ok(())
    }

    fn record_failure(&self, code: &str, phase: &str) {
        let category = classify_runtime_error(code);
        if let Ok(mut observation) = self.observation.lock() {
            observation.runtime_config = None;
            observation.ready = None;
            observation.last_failure = Some(DiagnosticFailure {
                category: category.to_string(),
                code: stable_runtime_code(code),
                phase: stable_runtime_code(phase),
            });
            if category == "job_object_failed" {
                observation.job_object_status = "failed".to_string();
            }
        }
    }

    fn runtime_config(&self) -> Result<Option<DesktopRuntimeConfig>, String> {
        Ok(self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?
            .runtime_config
            .clone())
    }

    fn observation(&self) -> Result<RuntimeObservation, String> {
        Ok(self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?
            .clone())
    }

    fn refresh_sidecar_status(&self) -> Result<(), String> {
        let was_ready = self
            .observation
            .lock()
            .map_err(|_| "desktop_runtime_observation_poisoned".to_string())?
            .runtime_config
            .is_some();
        if !was_ready {
            return Ok(());
        }
        let mut exit_code = None;
        let exited = {
            let mut guard = self
                .sidecar
                .lock()
                .map_err(|_| "desktop_sidecar_state_poisoned".to_string())?;
            match guard.as_mut() {
                None => true,
                Some(sidecar) => match sidecar.child.try_wait() {
                    Ok(None) => false,
                    Ok(Some(status)) => {
                        exit_code = status.code();
                        guard.take();
                        true
                    }
                    Err(_) => {
                        guard.take();
                        true
                    }
                },
            }
        };
        if exited {
            if let Ok(mut observation) = self.observation.lock() {
                observation.sidecar_exit_code = exit_code;
            }
            self.record_failure("desktop_sidecar_exited_after_ready", "sidecar_monitor");
        }
        Ok(())
    }

    fn persist_window<R: tauri::Runtime>(&self, window: &tauri::Window<R>) -> Result<(), String> {
        let path = self
            .window_state_path
            .lock()
            .map_err(|_| "desktop_window_state_path_poisoned".to_string())?
            .clone()
            .ok_or_else(|| "desktop_window_state_path_missing".to_string())?;
        let position = window
            .outer_position()
            .map_err(|_| "desktop_window_position_unavailable".to_string())?;
        let size = window
            .inner_size()
            .map_err(|_| "desktop_window_size_unavailable".to_string())?;
        let state = PersistedWindowState {
            version: WINDOW_STATE_VERSION,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: window
                .is_maximized()
                .map_err(|_| "desktop_window_maximized_state_unavailable".to_string())?,
        };
        persist_window_state_atomic(&path, &state)
    }

    fn shutdown(&self) {
        let sidecar = self.sidecar.lock().ok().and_then(|mut guard| guard.take());
        if let Some(mut sidecar) = sidecar {
            sidecar.shutdown();
        }
    }
}

struct ManagedSidecar {
    child: Child,
    job: Option<JobObject>,
}

impl ManagedSidecar {
    fn shutdown(&mut self) {
        // Closing stdin is the private graceful-shutdown signal. The sidecar
        // then closes HTTP sockets, SQLite, and llama-server in that order.
        self.child.stdin.take();
        let deadline = Instant::now() + SIDECAR_GRACEFUL_SHUTDOWN;
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(_) => break,
            }
        }

        if let Some(job) = self.job.as_ref() {
            job.terminate();
        } else {
            terminate_process_tree_fallback(self.child.id());
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for ManagedSidecar {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(windows)]
struct JobObject {
    handle: isize,
}

#[cfg(windows)]
impl JobObject {
    fn create() -> Result<Self, String> {
        use std::{mem::size_of, ptr};
        use windows_sys::Win32::System::JobObjects::{
            CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() {
            return Err("desktop_job_create_failed".to_string());
        }
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(handle);
            }
            return Err("desktop_job_configure_failed".to_string());
        }
        Ok(Self {
            handle: handle as isize,
        })
    }

    fn assign(&self, child: &Child) -> Result<(), String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{
            Foundation::HANDLE, System::JobObjects::AssignProcessToJobObject,
        };

        let assigned = unsafe {
            AssignProcessToJobObject(self.handle as HANDLE, child.as_raw_handle() as HANDLE)
        };
        if assigned == 0 {
            return Err("desktop_job_assign_failed".to_string());
        }
        Ok(())
    }

    fn terminate(&self) {
        use windows_sys::Win32::{Foundation::HANDLE, System::JobObjects::TerminateJobObject};
        unsafe {
            TerminateJobObject(self.handle as HANDLE, 1);
        }
    }
}

#[cfg(windows)]
impl Drop for JobObject {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        unsafe {
            CloseHandle(self.handle as HANDLE);
        }
    }
}

#[cfg(not(windows))]
struct JobObject;

#[cfg(not(windows))]
impl JobObject {
    fn create() -> Result<Self, String> {
        Err("desktop_job_objects_require_windows".to_string())
    }

    fn assign(&self, _child: &Child) -> Result<(), String> {
        Err("desktop_job_objects_require_windows".to_string())
    }

    fn terminate(&self) {}
}

fn terminate_process_tree_fallback(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

fn stable_runtime_code(raw: &str) -> String {
    let candidate = raw.trim();
    if !candidate.is_empty()
        && candidate.len() <= 120
        && candidate
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':'))
        && !candidate.contains(":\\")
        && !candidate.contains("/")
    {
        return candidate.to_string();
    }
    let normalized = candidate.to_ascii_lowercase();
    if normalized.contains("access denied") || normalized.contains("permission") {
        "runtime_access_denied".to_string()
    } else if normalized.contains("not found") || normalized.contains("missing") {
        "runtime_resource_missing".to_string()
    } else if normalized.contains("timeout") {
        "runtime_timeout".to_string()
    } else if normalized.contains("sqlite") || normalized.contains("database") {
        "sqlite_runtime_error".to_string()
    } else {
        "unknown_runtime_failure".to_string()
    }
}

fn classify_runtime_error(raw: &str) -> &'static str {
    let code = stable_runtime_code(raw).to_ascii_lowercase();
    if code.contains("job_object") || code.contains("job_") {
        return "job_object_failed";
    }
    if code.contains("r4_data_directory")
        || code.contains("data_dir")
        || code.contains("log_open")
        || code.contains("directory")
        || code.contains("runtime_access_denied")
    {
        return if code.contains("runtime_access_denied") {
            "security_software_suspected"
        } else {
            "data_directory_unwritable"
        };
    }
    if code.contains("llama")
        && (code.contains("exited") || code.contains("start") || code.contains("spawn"))
    {
        return "llama_start_failed";
    }
    if code.contains("llama") && (code.contains("dependency") || code.contains("dll")) {
        return "llama_dependency_missing";
    }
    if code.contains("exited") || code.contains("sidecar_closed") {
        return "sidecar_exited";
    }
    if code.contains("handshake")
        || code.contains("startup_timeout")
        || code.contains("start_gate_timeout")
    {
        return "sidecar_handshake_timeout";
    }
    if code.contains("node_runtime_missing") {
        return "runtime_resources_missing";
    }
    if code.contains("spawn") || code.contains("node_runtime") {
        return "node_spawn_failed";
    }
    if code.contains("resource") || code.contains("manifest") || code.contains("app_root") {
        return "runtime_resources_missing";
    }
    if code.contains("sqlite") || code.contains("database") {
        return if code.contains("lock") || code.contains("corrupt") || code.contains("schema") {
            "sqlite_locked_or_corrupt"
        } else {
            "sqlite_open_failed"
        };
    }
    if code.contains("loopback")
        || code.contains("health_probe")
        || code.contains("port")
        || code.contains("api_bind")
    {
        return "loopback_unavailable";
    }
    if code.contains("model_missing") || code.contains("checksum") || code.contains("integrity") {
        return "model_missing_or_invalid";
    }
    if code.contains("cpu") || code.contains("instruction") {
        return "llama_cpu_incompatible";
    }
    if code.contains("memory") || code.contains("allocation") {
        return "llama_memory_insufficient";
    }
    if code.contains("security") || code.contains("blocked") || code.contains("quarantine") {
        return "security_software_suspected";
    }
    "unknown_runtime_failure"
}

fn recovery_suggestions(category: &str) -> Vec<String> {
    let suggestion = match category {
        "runtime_resources_missing" => "重新安装或完整解压应用；不要只复制 exe 文件。 / Reinstall or fully extract the application; do not copy only the exe.",
        "node_spawn_failed" => "重新安装完整版本，并保留 resources 目录。 / Reinstall the complete version and keep the resources directory.",
        "job_object_failed" => "关闭重复实例后重新准备；仍失败时导出诊断报告。 / Close duplicate instances and prepare again; export a diagnostic report if it persists.",
        "sidecar_handshake_timeout" => "重新准备并检查本机安全软件记录。 / Prepare again and check local security-software history.",
        "sidecar_exited" => "检查运行组件是否被隔离或缺少 DLL。 / Check whether a runtime component was quarantined or is missing a DLL.",
        "data_directory_unwritable" => "使用可写的用户数据目录；不要删除数据库。 / Use a writable user data directory; do not delete the database.",
        "sqlite_open_failed" => "关闭旧版本实例后重试；不要删除数据库。 / Close older app instances and retry; do not delete the database.",
        "sqlite_locked_or_corrupt" => "先备份并导出诊断报告，再执行明确的恢复动作。 / Back up the database and export diagnostics before explicit repair.",
        "loopback_unavailable" => "重新准备并检查 127.0.0.1 是否被阻止。 / Prepare again and check whether 127.0.0.1 was blocked.",
        "model_missing_or_invalid" => "检查模型文件是否完整且匹配清单。 / Check that the model is complete and matches the manifest.",
        "llama_dependency_missing" => "重新安装完整版本，不要只复制 llama-server.exe。 / Reinstall the complete version; do not copy only llama-server.exe.",
        "llama_cpu_incompatible" => "改用轻量配置或更换设备，并导出诊断报告。 / Use the lightweight profile or another device and export diagnostics.",
        "llama_memory_insufficient" => "关闭占用内存的程序后重试轻量配置。 / Close memory-intensive programs and retry the lightweight profile.",
        "llama_start_failed" => "导出诊断报告后重新准备，不要启动重复实例。 / Export diagnostics and prepare again; do not start duplicate instances.",
        "security_software_suspected" => "查看 Windows 安全记录；不要关闭安全软件。 / Check Windows security history; do not disable security software.",
        _ => "导出诊断报告后重新准备；已有训练记录不会被静默删除。 / Export diagnostics and prepare again; existing training records are not silently deleted."
    };
    vec![suggestion.to_string()]
}

fn redact_path(path: Option<&Path>) -> String {
    let Some(path) = path else {
        return String::new();
    };
    let roots = [
        ("%LOCALAPPDATA%", "LOCALAPPDATA"),
        ("%USERPROFILE%", "USERPROFILE"),
        ("%TEMP%", "TEMP"),
    ];
    for (label, environment) in roots {
        if let Some(root) = env::var_os(environment) {
            let root = PathBuf::from(root);
            if let Ok(relative) = path.strip_prefix(&root) {
                return if relative.as_os_str().is_empty() {
                    label.to_string()
                } else {
                    format!("{}\\{}", label, relative.display())
                };
            }
        }
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("item");
    format!("<redacted>\\{}", name)
}

fn directory_writable(path: Option<&Path>) -> bool {
    let Some(path) = path else { return false };
    if !path.is_dir() {
        return false;
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let probe = path.join(format!(
        ".hematuria-diagnostic-{}-{nonce}.tmp",
        std::process::id()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe)
            .ok()?;
        file.write_all(b"ok").ok()?;
        file.sync_all().ok()?;
        Some(())
    })();
    let _ = fs::remove_file(&probe);
    result.is_some()
}

fn diagnostic_file(name: &str, path: Option<&Path>, expected_size: Option<u64>) -> DiagnosticFile {
    let Some(path) = path else {
        return DiagnosticFile {
            name: name.to_string(),
            path: String::new(),
            present: false,
            size: None,
            size_matches: false,
            sha256_status: "missing".to_string(),
        };
    };
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => DiagnosticFile {
            name: name.to_string(),
            path: redact_path(Some(path)),
            present: true,
            size: Some(metadata.len()),
            size_matches: expected_size.is_none_or(|value| value == metadata.len()),
            sha256_status: "not_checked".to_string(),
        },
        _ => DiagnosticFile {
            name: name.to_string(),
            path: redact_path(Some(path)),
            present: false,
            size: None,
            size_matches: false,
            sha256_status: "missing".to_string(),
        },
    }
}

#[cfg(windows)]
fn random_secret_hex() -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{
        BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
    };
    let mut bytes = [0_u8; 32];
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status != 0 {
        return Err(format!("desktop_random_generation_failed:{status}"));
    }
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(not(windows))]
fn random_secret_hex() -> Result<String, String> {
    Err("desktop_random_generation_requires_windows".to_string())
}

fn configured_absolute_path(name: &str) -> Result<Option<PathBuf>, String> {
    let Some(value) = env::var_os(name) else {
        return Ok(None);
    };
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!("{name}_must_be_absolute"));
    }
    Ok(Some(path))
}

fn configured_model_mode() -> Result<Option<String>, String> {
    match env::var("HEMATURIA_DESKTOP_MODEL_MODE") {
        Ok(value) if matches!(value.as_str(), "lightweight" | "standard") => Ok(Some(value)),
        Ok(_) | Err(env::VarError::NotUnicode(_)) => {
            Err("desktop_model_mode_invalid".to_string())
        }
        Err(env::VarError::NotPresent) => Ok(None),
    }
}

fn packaged_lightweight_model_path() -> Option<PathBuf> {
    let executable_directory = env::current_exe().ok()?.parent()?.to_path_buf();
    let file_name = "Qwen3-1.7B-Q4_K_M.gguf";
    first_file([
        executable_directory.join("Model").join(file_name),
        executable_directory.parent()?.join("Model").join(file_name),
    ])
}

fn desktop_data_directory(_app: &tauri::App) -> Result<PathBuf, String> {
    let candidate = configured_absolute_path("HEMATURIA_DESKTOP_DATA_DIR")?.map_or_else(
        || {
            env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .map(|root| root.join("HematuriaTraining").join(R5_DATA_DIRECTORY_NAME))
                .ok_or_else(|| "desktop_local_data_dir_unavailable".to_string())
        },
        Ok,
    )?;
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let legacy = PathBuf::from(local_app_data)
            .join("HematuriaTraining")
            .join(R4_DATA_DIRECTORY_NAME);
        if candidate
            .to_string_lossy()
            .eq_ignore_ascii_case(&legacy.to_string_lossy())
        {
            return Err("desktop_r4_data_directory_rejected".to_string());
        }
    }
    Ok(candidate)
}

fn first_file(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn first_directory(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.is_dir())
}

fn desktop_test_mode() -> bool {
    env::var("HEMATURIA_DESKTOP_INSTALLATION_MODE")
        .ok()
        .as_deref()
        == Some("development")
        && env::var("HEMATURIA_DESKTOP_TEST_MODE").ok().as_deref() == Some("1")
}

fn resolve_runtime_layout<R: tauri::Runtime, M: tauri::Manager<R>>(
    app: &M,
) -> Result<RuntimeLayout, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|_| "desktop_resource_dir_unavailable".to_string())?;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let development_root = manifest_dir
        .parent()
        .ok_or_else(|| "desktop_repository_root_unavailable".to_string())?
        .to_path_buf();

    let app_root = first_directory([
        resource_dir.join("resources").join("app"),
        resource_dir.join("app"),
        development_root.clone(),
    ])
    .filter(|root| {
        root.join("desktop")
            .join("sidecar")
            .join("index.cjs")
            .is_file()
    })
    .ok_or_else(|| "desktop_sidecar_resources_missing".to_string())?;

    let node = if let Some(configured) = configured_absolute_path("HEMATURIA_DESKTOP_NODE")? {
        configured
    } else {
        first_file([
            resource_dir
                .join("resources")
                .join("runtime")
                .join("node")
                .join("node.exe"),
            resource_dir.join("runtime").join("node").join("node.exe"),
            development_root
                .join("desktop-runtime")
                .join("node")
                .join("node.exe"),
        ])
        .ok_or_else(|| "desktop_node_runtime_missing_run_desktop_prepare".to_string())?
    };

    let llama_server = if desktop_test_mode() {
        configured_absolute_path("HEMATURIA_LLAMA_SERVER_PATH")?
    } else {
        None
    }
    .or_else(|| {
        first_file([
            resource_dir
                .join("resources")
                .join("runtime")
                .join("llama")
                .join("llama-server.exe"),
            resource_dir
                .join("runtime")
                .join("llama")
                .join("llama-server.exe"),
            development_root
                .join("desktop-runtime")
                .join("llama")
                .join("llama-server.exe"),
        ])
    });
    Ok(RuntimeLayout {
        app_root,
        node,
        llama_server,
    })
}

fn sanitized_child_environment(
    command: &mut Command,
    app_root: &Path,
    data_dir: &Path,
    database_path: &Path,
    llama_server: Option<&Path>,
    bearer: &str,
    handshake: &str,
) -> Result<(), String> {
    let installation_mode =
        env::var("HEMATURIA_DESKTOP_INSTALLATION_MODE").unwrap_or_else(|_| "unknown".to_string());
    command.env_clear();
    for key in [
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "LOCALAPPDATA",
        "USERPROFILE",
    ] {
        if let Some(value) = env::var_os(key) {
            command.env(key, value);
        }
    }
    if let Some(system_root) = env::var_os("SystemRoot") {
        command.env("PATH", PathBuf::from(system_root).join("System32"));
    }
    command
        .env("NODE_ENV", "production")
        .env("NODE_NO_WARNINGS", "1")
        .env("NO_COLOR", "1")
        .env("HEMATURIA_RUNTIME_TARGET", "desktop")
        .env("HEMATURIA_APP_ROOT", app_root)
        .env("HEMATURIA_DESKTOP_DATA_DIR", data_dir)
        .env("HEMATURIA_DESKTOP_DATABASE_PATH", database_path)
        .env(
            "HEMATURIA_LLAMA_SERVER_PATH",
            llama_server
                .map(|path| path.as_os_str())
                .unwrap_or_else(|| std::ffi::OsStr::new("")),
        )
        .env("HEMATURIA_DESKTOP_BEARER", bearer)
        .env("HEMATURIA_DESKTOP_HANDSHAKE", handshake)
        .env("HEMATURIA_DESKTOP_ALLOWED_ORIGINS", DESKTOP_ORIGINS)
        .env(
            "HEMATURIA_PRODUCT_VERSION",
            option_env!("CARGO_PKG_VERSION").unwrap_or("0.5.0"),
        )
        .env("HEMATURIA_DESKTOP_INSTALLATION_MODE", installation_mode);
    command.env(
        "HEMATURIA_PRODUCT_HEAD",
        option_env!("HEMATURIA_PRODUCT_HEAD").unwrap_or("desktop-local"),
    );

    if let Some(model_path) = configured_absolute_path("HEMATURIA_DESKTOP_MODEL_PATH")?
        .or_else(packaged_lightweight_model_path)
    {
        command.env("HEMATURIA_DESKTOP_MODEL_PATH", model_path);
    }
    if let Some(model_mode) = configured_model_mode()? {
        command.env("HEMATURIA_DESKTOP_MODEL_MODE", model_mode);
    }
    if let Some(disabled) = env::var_os("HEMATURIA_DESKTOP_DISABLE_LOCAL_AI") {
        command.env("HEMATURIA_DESKTOP_DISABLE_LOCAL_AI", disabled);
    }
    if desktop_test_mode() {
        command.env("HEMATURIA_DESKTOP_TEST_MODE", "1");
        for key in [
            "HEMATURIA_LLAMA_SERVER_PREFIX_ARGS",
            "HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE",
        ] {
            if let Some(value) = env::var_os(key) {
                command.env(key, value);
            }
        }
    }
    if env::var("HEMATURIA_RUNTIME_AUDIT_TRACE").ok().as_deref() == Some("1") {
        command.env("HEMATURIA_RUNTIME_AUDIT_TRACE", "1");
    }
    if cfg!(debug_assertions) {
        command.env("HEMATURIA_DESKTOP_DEBUG_RUNTIME", "1");
    }
    Ok(())
}

fn validate_ready_message(
    line: &str,
    expected_handshake: &str,
    expected_pid: u32,
) -> Result<ReadyMessage, String> {
    let value: serde_json::Value = serde_json::from_str(line)
        .map_err(|_| "desktop_sidecar_handshake_invalid_json".to_string())?;
    if value.get("event").and_then(|event| event.as_str()) == Some("failure") {
        let code = value
            .get("code")
            .and_then(|code| code.as_str())
            .filter(|code| !code.is_empty() && code.len() <= 120)
            .unwrap_or("desktop_sidecar_start_failed");
        let phase = value
            .get("phase")
            .and_then(|phase| phase.as_str())
            .unwrap_or("sidecar_startup");
        return Err(format!(
            "{}|{}",
            stable_runtime_code(phase),
            stable_runtime_code(code)
        ));
    }
    let message: ReadyMessage = serde_json::from_value(value)
        .map_err(|_| "desktop_sidecar_handshake_invalid_json".to_string())?;
    if message.event != "ready"
        || message.protocol_version != SIDECAR_PROTOCOL_VERSION
        || message.handshake != expected_handshake
        || message.pid != expected_pid
        || message.database_schema_version == 0
    {
        return Err("desktop_sidecar_handshake_rejected".to_string());
    }
    let port = message
        .origin
        .strip_prefix("http://127.0.0.1:")
        .ok_or_else(|| "desktop_sidecar_origin_rejected".to_string())?
        .parse::<u16>()
        .map_err(|_| "desktop_sidecar_origin_rejected".to_string())?;
    if port == 0 || message.origin != format!("http://127.0.0.1:{port}") {
        return Err("desktop_sidecar_origin_rejected".to_string());
    }
    Ok(message)
}

fn wait_for_ready(
    stdout: impl std::io::Read + Send + 'static,
    expected_handshake: String,
    expected_pid: u32,
) -> Result<ReadyMessage, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let result = match reader.read_line(&mut line) {
            Ok(0) => Err("desktop_sidecar_exited_before_handshake".to_string()),
            Ok(_) if line.len() > 16 * 1024 => {
                Err("desktop_sidecar_handshake_too_large".to_string())
            }
            Ok(_) => validate_ready_message(line.trim(), &expected_handshake, expected_pid),
            Err(_) => Err("desktop_sidecar_handshake_read_failed".to_string()),
        };
        let _ = sender.send(result);
    });
    receiver
        .recv_timeout(SIDECAR_STARTUP_TIMEOUT)
        .map_err(|_| "desktop_sidecar_startup_timeout".to_string())?
}

fn start_sidecar(
    layout: &RuntimeLayout,
    data_dir: &Path,
    lifecycle: &LifecycleState,
) -> Result<(ManagedSidecar, ReadyMessage, String), String> {
    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&logs_dir).map_err(|_| "desktop_data_dir_create_failed".to_string())?;
    let database_path = data_dir.join("hematuria.sqlite3");
    let log_file = File::create(logs_dir.join("sidecar-current.log"))
        .map_err(|_| "desktop_log_open_failed".to_string())?;

    let bearer = random_secret_hex()?;
    let handshake = random_secret_hex()?;
    let entry = layout
        .app_root
        .join("desktop")
        .join("sidecar")
        .join("index.cjs");
    let mut command = Command::new(&layout.node);
    command
        .arg(&entry)
        .current_dir(&layout.app_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log_file));
    sanitized_child_environment(
        &mut command,
        &layout.app_root,
        &data_dir,
        &database_path,
        layout.llama_server.as_deref(),
        &bearer,
        &handshake,
    )?;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    // The desktop contract requires a kill-on-close Job Object. Refuse to
    // start instead of accepting an orphan-prone process tree.
    let job = JobObject::create()?;
    let mut child = command
        .spawn()
        .map_err(|_| "desktop_sidecar_spawn_failed".to_string())?;
    lifecycle.mark_startup(|startup| startup.sidecar_spawned = true);
    if let Err(error) = job.assign(&child) {
        terminate_process_tree_fallback(child.id());
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let job = Some(job);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "desktop_sidecar_stdout_missing".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "desktop_sidecar_stdin_missing".to_string())?
        .write_all(b"START\n")
        .map_err(|_| "desktop_sidecar_start_gate_failed".to_string())?;
    let ready = match wait_for_ready(stdout, handshake, child.id()) {
        Ok(ready) => ready,
        Err(error) => {
            let mut managed = ManagedSidecar { child, job };
            managed.shutdown();
            return Err(error);
        }
    };
    lifecycle.mark_startup(|startup| startup.sidecar_ready = true);
    Ok((ManagedSidecar { child, job }, ready, bearer))
}

fn bootstrap_marker_script(runtime_expected: bool, finalized: bool) -> String {
    if finalized {
        format!(
            "globalThis.__HEMATURIA_DESKTOP_BOOTSTRAP__=Object.freeze({{scriptExecuted:true,runtimeExpected:{runtime_expected},runtimeDefined:globalThis.__HEMATURIA_DESKTOP_RUNTIME__?.runtimeTarget==='desktop',diagnosticDefined:Boolean(globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__),schemaVersion:{BOOTSTRAP_SCHEMA_VERSION}}});"
        )
    } else {
        format!(
            "Object.defineProperty(globalThis,'__HEMATURIA_DESKTOP_BOOTSTRAP__',{{value:{{scriptExecuted:true,runtimeExpected:{runtime_expected},runtimeDefined:false,diagnosticDefined:false,schemaVersion:{BOOTSTRAP_SCHEMA_VERSION}}},writable:true,configurable:false,enumerable:false}});"
        )
    }
}

fn runtime_initialization_script(
    runtime: Option<&DesktopRuntimeConfig>,
    diagnostics: &DesktopDiagnosticReport,
) -> Result<String, String> {
    let runtime_expected = runtime.is_some();
    let diagnostic = serde_json::to_string(diagnostics)
        .map_err(|_| "desktop_runtime_injection_serialize_failed".to_string())?;
    let mut script = bootstrap_marker_script(runtime_expected, false);
    script.push_str(&format!(
        "Object.defineProperty(globalThis,'__HEMATURIA_DESKTOP_DIAGNOSTIC__',{{value:Object.freeze({diagnostic}),writable:true,configurable:false,enumerable:false}});"
    ));
    if let Some(runtime) = runtime {
        let serialized = serde_json::to_string(runtime)
            .map_err(|_| "desktop_runtime_injection_serialize_failed".to_string())?;
        script.push_str(&format!(
            "Object.defineProperty(globalThis,'__HEMATURIA_DESKTOP_RUNTIME__',{{value:Object.freeze({serialized}),writable:true,configurable:false,enumerable:false}});"
        ));
    }
    script.push_str(&bootstrap_marker_script(runtime_expected, true));
    Ok(script)
}

#[cfg(windows)]
fn standard_user_status() -> Option<bool> {
    use windows_sys::Win32::UI::Shell::IsUserAnAdmin;
    Some(unsafe { IsUserAnAdmin() == 0 })
}

#[cfg(not(windows))]
fn standard_user_status() -> Option<bool> {
    None
}

fn operating_system_version() -> String {
    #[cfg(windows)]
    {
        let output = Command::new("cmd")
            .args(["/C", "ver"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        if let Ok(output) = output {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if value.len() <= 120 && !value.contains('\\') && !value.contains('/') {
                return value;
            }
        }
    }
    env::consts::OS.to_string()
}

fn installation_mode<R: tauri::Runtime, M: tauri::Manager<R>>(app: &M) -> String {
    if let Ok(value) = env::var("HEMATURIA_DESKTOP_INSTALLATION_MODE") {
        if matches!(value.as_str(), "installer" | "portable" | "development") {
            return value;
        }
    }
    if app
        .path()
        .resource_dir()
        .map(|path| {
            path.join("portable.marker").is_file()
                || path.join("resources").join("portable.marker").is_file()
        })
        .unwrap_or(false)
    {
        return "portable".to_string();
    }
    if let Ok(path) = env::current_exe() {
        let value = path.to_string_lossy().to_ascii_lowercase();
        if value.contains("program files") || value.contains("appdata\\local") {
            return "installer".to_string();
        }
    }
    "unknown".to_string()
}

fn diagnostic_report<R: tauri::Runtime, M: tauri::Manager<R>>(
    app: &M,
    lifecycle: &LifecycleState,
) -> Result<DesktopDiagnosticReport, String> {
    lifecycle.refresh_sidecar_status()?;
    let observation = lifecycle.observation()?;
    let data_dir = observation.data_dir.as_ref();
    let layout = observation.layout.as_ref();
    let application_path = env::current_exe().ok();
    let app_root = layout.map(|value| value.app_root.as_path());
    let database_path = data_dir.map(|path| path.join("hematuria.sqlite3"));
    let log_directory = data_dir.map(|path| path.join("logs"));
    let model_path = configured_absolute_path("HEMATURIA_DESKTOP_MODEL_PATH")
        .ok()
        .flatten()
        .or_else(packaged_lightweight_model_path)
        .or_else(|| data_dir.map(|path| path.join("models").join("Qwen3-1.7B-Q4_K_M.gguf")));
    let legacy_path = env::var_os("LOCALAPPDATA").map(|root| {
        PathBuf::from(root)
            .join("HematuriaTraining")
            .join(R4_DATA_DIRECTORY_NAME)
    });
    let failure = observation.last_failure.clone();
    let current_category = failure
        .as_ref()
        .map(|value| value.category.as_str())
        .unwrap_or("unknown_runtime_failure");
    let ready = observation.ready.as_ref();
    let sidecar_status = if ready.is_some() {
        "ready"
    } else if failure.is_some() {
        "failed"
    } else {
        "not_started"
    };
    let sidecar_phase = failure
        .as_ref()
        .map(|value| value.phase.clone())
        .unwrap_or_else(|| {
            if ready.is_some() {
                "ready".to_string()
            } else {
                "not_started".to_string()
            }
        });
    let port = ready.and_then(|value| {
        value
            .origin
            .strip_prefix("http://127.0.0.1:")
            .and_then(|text| text.parse::<u16>().ok())
    });
    let data_accessible = data_dir.map(|path| path.is_dir()).unwrap_or(false);
    let data_writable = directory_writable(data_dir.map(|path| path.as_path()));
    let sidecar_path = app_root.map(|path| path.join("desktop").join("sidecar").join("index.cjs"));
    let sidecar_pid = ready.map(|value| value.pid).or(observation.sidecar_pid);
    let sidecar_exit_code = observation.sidecar_exit_code;
    let schema_version = ready.map(|value| value.database_schema_version);
    let legacy_detected = legacy_path
        .as_ref()
        .map(|path| path.is_dir())
        .unwrap_or(false);
    let report = DesktopDiagnosticReport {
        schema_version: DIAGNOSTIC_SCHEMA_VERSION,
        product_identity: R5_PRODUCT_IDENTITY,
        product_version: option_env!("CARGO_PKG_VERSION")
            .unwrap_or("0.5.0")
            .to_string(),
        product_head: option_env!("HEMATURIA_PRODUCT_HEAD")
            .unwrap_or("desktop-local")
            .to_string(),
        runtime_target: "desktop",
        installation_mode: installation_mode(app),
        operating_system: serde_json::json!({
            "platform": env::consts::OS,
            "version": operating_system_version(),
            "architecture": env::consts::ARCH
        }),
        standard_user: standard_user_status(),
        paths: serde_json::json!({
            "program": redact_path(application_path.as_deref()),
            "applicationRoot": redact_path(app_root),
            "data": redact_path(data_dir.map(|path| path.as_path())),
            "dataAccessible": data_accessible,
            "dataWritable": data_writable,
            "logs": redact_path(log_directory.as_deref()),
            "database": redact_path(database_path.as_deref()),
            "model": redact_path(model_path.as_deref()),
            "temporary": redact_path(Some(env::temp_dir().as_path()))
        }),
        resources: vec![
            diagnostic_file("node", layout.map(|value| value.node.as_path()), None),
            diagnostic_file("sidecar", sidecar_path.as_deref(), None),
            diagnostic_file(
                "llama_server",
                layout.and_then(|value| value.llama_server.as_deref()),
                None,
            ),
            diagnostic_file("model", model_path.as_deref(), None),
        ],
        processes: serde_json::json!({
            "sidecar": { "status": sidecar_status, "pid": sidecar_pid, "exitCode": sidecar_exit_code },
            "llamaServer": { "status": "unverified", "pid": null, "exitCode": null }
        }),
        job_object: serde_json::json!({
            "status": if observation.job_object_status.is_empty() { "not_started" } else { observation.job_object_status.as_str() },
            "code": if current_category == "job_object_failed" { failure.as_ref().map(|value| value.code.clone()) } else { None::<String> }
        }),
        sidecar: serde_json::json!({
            "status": sidecar_status,
            "phase": sidecar_phase,
            "handshake": if ready.is_some() { "ready" } else { "not_ready" },
            "pid": sidecar_pid,
            "exitCode": sidecar_exit_code,
            "origin": ready.map(|value| value.origin.clone())
        }),
        sqlite: serde_json::json!({
            "status": if schema_version.is_some() { "open" } else if database_path.as_ref().map(|path| path.is_file()).unwrap_or(false) { "present_unchecked" } else { "not_available" },
            "schemaVersion": schema_version,
            "journalMode": "wal_expected"
        }),
        loopback: serde_json::json!({
            "status": if port.is_some() { "listening" } else { "not_available" },
            "host": "127.0.0.1",
            "port": port
        }),
        local_ai: serde_json::json!({
            "status": if ready.is_some() { "starting_or_unverified" } else { "not_available" },
            "model": "Qwen3-1.7B",
            "modelValidation": "not_checked",
            "failureCategory": if current_category == "unknown_runtime_failure" && failure.is_none() { None::<&str> } else { Some(current_category) },
            "failureCode": failure.as_ref().map(|value| value.code.clone()),
            "processId": null,
            "exitCode": null
        }),
        startup: observation.startup.clone(),
        last_failure: failure.clone(),
        stable_failure_codes: failure.iter().map(|value| value.code.clone()).collect(),
        data_isolation: serde_json::json!({
            "currentProfile": "R5",
            "currentDirectory": R5_DATA_DIRECTORY_NAME,
            "legacyR4Detected": legacy_detected,
            "legacyR4Path": redact_path(legacy_path.as_deref()),
            "concurrentWritesPrevented": true,
            "migrationPerformed": false
        }),
        recovery_suggestions: if failure.is_some() {
            recovery_suggestions(current_category)
        } else {
            Vec::new()
        },
        generated_at: chrono_like_now(),
    };
    Ok(report)
}

fn chrono_like_now() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix:{}", duration.as_secs())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDiagnosticExport {
    exported: bool,
    path: String,
    size: usize,
    sha256_status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeRestartResult {
    prepared: bool,
    runtime: Option<DesktopRuntimeConfig>,
    diagnostic: DesktopDiagnosticReport,
}

fn diagnostic_export_directory(lifecycle: &LifecycleState) -> Result<PathBuf, String> {
    let observation = lifecycle.observation()?;
    if let Some(data_dir) = observation.data_dir.as_ref() {
        if directory_writable(Some(data_dir)) {
            return Ok(data_dir.join("exports"));
        }
    }
    Ok(env::temp_dir()
        .join("HematuriaTraining")
        .join("R5-diagnostics"))
}

#[tauri::command]
fn desktop_diagnostic_snapshot(
    app: tauri::AppHandle,
    lifecycle: tauri::State<'_, LifecycleState>,
) -> Result<DesktopDiagnosticReport, String> {
    diagnostic_report(&app, &lifecycle)
}

#[tauri::command]
fn desktop_diagnostic_export(
    app: tauri::AppHandle,
    lifecycle: tauri::State<'_, LifecycleState>,
) -> Result<DesktopDiagnosticExport, String> {
    let report = diagnostic_report(&app, &lifecycle)?;
    let serialized = serde_json::to_vec_pretty(&report)
        .map_err(|_| "desktop_diagnostic_serialize_failed".to_string())?;
    let directory = diagnostic_export_directory(&lifecycle)?;
    fs::create_dir_all(&directory)
        .map_err(|_| "desktop_diagnostic_directory_failed".to_string())?;
    let file_path = directory.join(format!(
        "hematuria-r5-runtime-diagnostic-{}-{}.json",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|_| "desktop_diagnostic_export_failed".to_string())?;
    file.write_all(&serialized)
        .map_err(|_| "desktop_diagnostic_export_failed".to_string())?;
    file.sync_all()
        .map_err(|_| "desktop_diagnostic_export_failed".to_string())?;
    Ok(DesktopDiagnosticExport {
        exported: true,
        path: file_path.to_string_lossy().to_string(),
        size: serialized.len(),
        sha256_status: "not_checked".to_string(),
    })
}

#[tauri::command]
fn desktop_open_logs_directory(
    lifecycle: tauri::State<'_, LifecycleState>,
) -> Result<String, String> {
    let observation = lifecycle.observation()?;
    let data_dir = observation
        .data_dir
        .ok_or_else(|| "desktop_data_directory_unavailable".to_string())?;
    let logs = data_dir.join("logs");
    fs::create_dir_all(&logs).map_err(|_| "desktop_log_directory_unavailable".to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("explorer.exe")
            .arg(&logs)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|_| "desktop_log_directory_open_failed".to_string())?;
    }
    #[cfg(not(windows))]
    {
        return Err("desktop_log_directory_open_requires_windows".to_string());
    }
    Ok(logs.to_string_lossy().to_string())
}

#[tauri::command]
fn desktop_restart_runtime(
    app: tauri::AppHandle,
    lifecycle: tauri::State<'_, LifecycleState>,
) -> Result<DesktopRuntimeRestartResult, String> {
    let _prepare_lock = lifecycle
        .prepare_lock
        .lock()
        .map_err(|_| "desktop_runtime_prepare_state_poisoned".to_string())?;
    lifecycle.refresh_sidecar_status()?;
    if let Some(runtime) = lifecycle.runtime_config()? {
        return Ok(DesktopRuntimeRestartResult {
            prepared: true,
            runtime: Some(runtime),
            diagnostic: diagnostic_report(&app, &lifecycle)?,
        });
    }
    let observation = lifecycle.observation()?;
    let Some(data_dir) = observation.data_dir else {
        lifecycle.record_failure("desktop_data_directory_unavailable", "runtime_prepare");
        return Ok(DesktopRuntimeRestartResult {
            prepared: false,
            runtime: None,
            diagnostic: diagnostic_report(&app, &lifecycle)?,
        });
    };
    let layout = match observation.layout {
        Some(layout) => layout,
        None => match resolve_runtime_layout(&app) {
            Ok(layout) => layout,
            Err(code) => {
                lifecycle.record_failure(&code, "resource_resolution");
                return Ok(DesktopRuntimeRestartResult {
                    prepared: false,
                    runtime: None,
                    diagnostic: diagnostic_report(&app, &lifecycle)?,
                });
            }
        },
    };
    let context = RuntimeContext {
        layout,
        data_dir: data_dir.clone(),
        window_state_path: data_dir.join(WINDOW_STATE_FILE),
    };
    lifecycle.set_context(context.clone())?;
    match start_sidecar(&context.layout, &context.data_dir, &lifecycle) {
        Ok((sidecar, ready, bearer)) => {
            lifecycle.install(sidecar, context, ready, bearer)?;
            Ok(DesktopRuntimeRestartResult {
                prepared: true,
                runtime: lifecycle.runtime_config()?,
                diagnostic: diagnostic_report(&app, &lifecycle)?,
            })
        }
        Err(code) => {
            lifecycle.record_failure(&code, "runtime_prepare");
            Ok(DesktopRuntimeRestartResult {
                prepared: false,
                runtime: None,
                diagnostic: diagnostic_report(&app, &lifecycle)?,
            })
        }
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>> {
    let lifecycle = app.state::<LifecycleState>();
    lifecycle.mark_startup(|startup| startup.setup_entered = true);
    let mut restored_window_state = None;
    match desktop_data_directory(app) {
        Ok(data_dir) => {
            lifecycle.mark_startup(|startup| startup.data_directory_resolved = true);
            let window_state_path = data_dir.join(WINDOW_STATE_FILE);
            lifecycle
                .set_data_directory(data_dir.clone(), window_state_path.clone())
                .map_err(std::io::Error::other)?;
            match resolve_runtime_layout(app) {
                Ok(layout) => {
                    lifecycle.mark_startup(|startup| startup.runtime_layout_resolved = true);
                    let context = RuntimeContext {
                        layout,
                        data_dir: data_dir.clone(),
                        window_state_path: window_state_path.clone(),
                    };
                    lifecycle
                        .set_context(context.clone())
                        .map_err(std::io::Error::other)?;
                    match fs::create_dir_all(&data_dir) {
                        Ok(()) => {
                            restored_window_state = match load_window_state(&window_state_path) {
                                Ok(state) => state,
                                Err(code) => {
                                    eprintln!("{{\"event\":\"desktop_window_state_ignored\",\"code\":\"{code}\"}}");
                                    None
                                }
                            };
                            match start_sidecar(&context.layout, &data_dir, &lifecycle) {
                                Ok((sidecar, ready, bearer)) => {
                                    lifecycle
                                        .install(sidecar, context, ready, bearer)
                                        .map_err(std::io::Error::other)?;
                                }
                                Err(failure) => {
                                    let (phase, code) = failure
                                        .split_once('|')
                                        .unwrap_or(("sidecar_startup", failure.as_str()));
                                    lifecycle.record_failure(code, phase);
                                }
                            }
                        }
                        Err(_) => lifecycle
                            .record_failure("desktop_data_dir_create_failed", "data_directory"),
                    }
                }
                Err(code) => lifecycle.record_failure(&code, "resource_resolution"),
            }
        }
        Err(code) => lifecycle.record_failure(&code, "data_directory"),
    }
    let diagnostic = diagnostic_report(app, &lifecycle).map_err(std::io::Error::other)?;
    let runtime = lifecycle.runtime_config().map_err(std::io::Error::other)?;
    let initialization_script = runtime_initialization_script(runtime.as_ref(), &diagnostic)
        .map_err(std::io::Error::other)?;
    lifecycle.mark_startup(|startup| {
        startup.initialization_script_built = true;
        startup.runtime_injection_expected = runtime.is_some();
        startup.window_build_started = true;
    });

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
            .title("血尿临床问诊训练系统")
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 640.0)
            .center()
            .resizable(true)
            .devtools(cfg!(debug_assertions))
            .initialization_script(initialization_script);
    if restored_window_state.is_none() {
        builder = builder.maximized(true);
    }
    let window = builder.build()?;
    lifecycle.mark_startup(|startup| startup.window_built = true);
    if let Some(state) = restored_window_state {
        window.set_size(tauri::PhysicalSize::new(state.width, state.height))?;
        if window_state_intersects_monitor(&window, &state) {
            window.set_position(tauri::PhysicalPosition::new(state.x, state.y))?;
        } else {
            window.center()?;
        }
        if state.maximized {
            window.maximize()?;
        }
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(LifecycleState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_diagnostic_snapshot,
            desktop_diagnostic_export,
            desktop_open_logs_directory,
            desktop_restart_runtime
        ])
        .setup(setup)
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let lifecycle = window.state::<LifecycleState>();
                if let Err(code) = lifecycle.persist_window(window) {
                    eprintln!(
                        "{{\"event\":\"desktop_window_state_save_failed\",\"code\":\"{code}\"}}"
                    );
                }
                lifecycle.shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run the hematuria desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock")
            .as_nanos();
        env::temp_dir().join(format!(
            "hematuria-desktop-window-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn missing_window_state_is_a_first_launch() {
        let directory = temporary_directory("missing");
        let path = directory.join(WINDOW_STATE_FILE);
        assert_eq!(load_window_state(&path).expect("missing state"), None);
    }

    #[test]
    fn window_state_is_atomically_replaced_and_restored() {
        let directory = temporary_directory("roundtrip");
        let path = directory.join(WINDOW_STATE_FILE);
        let first = PersistedWindowState {
            version: WINDOW_STATE_VERSION,
            x: 40,
            y: 50,
            width: 1280,
            height: 820,
            maximized: true,
        };
        let second = PersistedWindowState {
            maximized: false,
            width: 1440,
            height: 900,
            ..first
        };
        persist_window_state_atomic(&path, &first).expect("first save");
        persist_window_state_atomic(&path, &second).expect("replacement save");
        assert_eq!(load_window_state(&path).expect("load"), Some(second));
        let entries = fs::read_dir(&directory).expect("state directory").count();
        assert_eq!(entries, 1, "temporary state files must not remain");
        fs::remove_dir_all(directory).expect("test cleanup");
    }

    #[test]
    fn invalid_window_state_is_rejected() {
        let invalid = PersistedWindowState {
            version: WINDOW_STATE_VERSION,
            x: 0,
            y: 0,
            width: MIN_WINDOW_WIDTH - 1,
            height: MIN_WINDOW_HEIGHT,
            maximized: false,
        };
        assert!(!invalid.valid());
    }

    #[test]
    fn runtime_failure_categories_are_stable() {
        let cases = [
            (
                "desktop_sidecar_resources_missing",
                "runtime_resources_missing",
            ),
            ("desktop_sidecar_spawn_failed", "node_spawn_failed"),
            ("desktop_job_assign_failed", "job_object_failed"),
            (
                "desktop_sidecar_startup_timeout",
                "sidecar_handshake_timeout",
            ),
            ("desktop_sidecar_exited_before_handshake", "sidecar_exited"),
            (
                "desktop_data_dir_create_failed",
                "data_directory_unwritable",
            ),
            ("desktop_sqlite_open_failed", "sqlite_open_failed"),
            ("desktop_sqlite_lock_corrupt", "sqlite_locked_or_corrupt"),
            ("desktop_loopback_unavailable", "loopback_unavailable"),
            ("desktop_health_probe_connect_failed", "loopback_unavailable"),
            ("desktop_health_probe_timeout", "loopback_unavailable"),
            ("desktop_health_probe_http_failed", "loopback_unavailable"),
            ("desktop_health_probe_payload_invalid", "loopback_unavailable"),
            ("desktop_health_probe_status_not_ok", "loopback_unavailable"),
            ("model_missing", "model_missing_or_invalid"),
            ("llama_dependency_missing", "llama_dependency_missing"),
            ("llama_cpu_incompatible", "llama_cpu_incompatible"),
            ("llama_memory_insufficient", "llama_memory_insufficient"),
            ("llama_server_exited_during_startup", "llama_start_failed"),
            ("runtime_access_denied", "security_software_suspected"),
            ("unclassified_runtime_event", "unknown_runtime_failure"),
        ];
        for (code, expected) in cases {
            assert_eq!(classify_runtime_error(code), expected, "{code}");
        }
    }

    #[test]
    fn sidecar_failure_preserves_health_probe_phase_and_code() {
        let failure = validate_ready_message(
            r#"{"event":"failure","code":"desktop_health_probe_connect_failed","phase":"loopback_health"}"#,
            "unused",
            1,
        )
        .expect_err("health probe failure must reject readiness");
        assert_eq!(
            failure,
            "loopback_health|desktop_health_probe_connect_failed"
        );
    }

    #[test]
    fn bootstrap_marker_is_non_sensitive_and_classifies_runtime_definition() {
        let started = bootstrap_marker_script(true, false);
        let finalized = bootstrap_marker_script(true, true);
        assert!(started.contains("scriptExecuted:true"));
        assert!(started.contains("runtimeExpected:true"));
        assert!(started.contains("runtimeDefined:false"));
        assert!(finalized.contains("__HEMATURIA_DESKTOP_RUNTIME__?.runtimeTarget==='desktop'"));
        assert!(!format!("{started}{finalized}").contains("authToken"));
        assert!(!format!("{started}{finalized}").contains("bearer"));
    }

    #[test]
    fn runtime_diagnostic_values_do_not_include_user_paths() {
        let code = stable_runtime_code(r#"C:\Users\someone\runtime.exe: access denied"#);
        assert!(!code.contains("someone"));
        let path = env::temp_dir().join("hematuria-runtime.exe");
        let redacted = redact_path(Some(&path));
        assert!(!redacted.contains("someone"));
        assert!(!redacted.contains("admin"));
    }
}
