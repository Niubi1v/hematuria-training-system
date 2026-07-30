use serde::Deserialize;
use std::{
    env,
    error::Error,
    fs::{self, File},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewUrl};

const SIDECAR_PROTOCOL_VERSION: u32 = 1;
const SIDECAR_STARTUP_TIMEOUT: Duration = Duration::from_secs(150);
const SIDECAR_GRACEFUL_SHUTDOWN: Duration = Duration::from_secs(3);
const DESKTOP_ORIGINS: &str =
    "http://tauri.localhost,https://tauri.localhost,tauri://localhost";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadyMessage {
    event: String,
    protocol_version: u32,
    handshake: String,
    pid: u32,
    origin: String,
    database_schema_version: u32,
}

struct RuntimeLayout {
    app_root: PathBuf,
    node: PathBuf,
    llama_server: PathBuf,
}

#[derive(Default)]
struct LifecycleState {
    sidecar: Mutex<Option<ManagedSidecar>>,
}

impl LifecycleState {
    fn install(&self, sidecar: ManagedSidecar) -> Result<(), String> {
        let mut guard = self
            .sidecar
            .lock()
            .map_err(|_| "desktop_sidecar_state_poisoned".to_string())?;
        if guard.is_some() {
            return Err("desktop_sidecar_already_started".to_string());
        }
        *guard = Some(sidecar);
        Ok(())
    }

    fn shutdown(&self) {
        let sidecar = self
            .sidecar
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
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
            return Err(format!(
                "desktop_job_create_failed:{}",
                std::io::Error::last_os_error()
            ));
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
            return Err(format!(
                "desktop_job_configure_failed:{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(Self {
            handle: handle as isize,
        })
    }

    fn assign(&self, child: &Child) -> Result<(), String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{
            Foundation::HANDLE,
            System::JobObjects::AssignProcessToJobObject,
        };

        let assigned = unsafe {
            AssignProcessToJobObject(
                self.handle as HANDLE,
                child.as_raw_handle() as HANDLE,
            )
        };
        if assigned == 0 {
            return Err(format!(
                "desktop_job_assign_failed:{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    fn terminate(&self) {
        use windows_sys::Win32::{
            Foundation::HANDLE,
            System::JobObjects::TerminateJobObject,
        };
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

fn first_existing(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn resolve_runtime_layout(app: &tauri::App) -> Result<RuntimeLayout, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("desktop_resource_dir_unavailable:{error}"))?;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let development_root = manifest_dir
        .parent()
        .ok_or_else(|| "desktop_repository_root_unavailable".to_string())?
        .to_path_buf();

    let app_root = first_existing([
        resource_dir.join("resources").join("app"),
        resource_dir.join("app"),
        development_root.clone(),
    ])
    .filter(|root| root.join("desktop").join("sidecar").join("index.cjs").is_file())
    .ok_or_else(|| "desktop_sidecar_resources_missing".to_string())?;

    let node = if let Some(configured) = configured_absolute_path("HEMATURIA_DESKTOP_NODE")? {
        configured
    } else {
        first_existing([
            resource_dir
                .join("resources")
                .join("runtime")
                .join("node")
                .join("node.exe"),
            resource_dir
                .join("runtime")
                .join("node")
                .join("node.exe"),
            development_root
                .join("desktop-runtime")
                .join("node")
                .join("node.exe"),
        ])
        .ok_or_else(|| "desktop_node_runtime_missing_run_desktop_prepare".to_string())?
    };

    let llama_server = first_existing([
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
    .unwrap_or_else(|| {
        resource_dir
            .join("resources")
            .join("runtime")
            .join("llama")
            .join("llama-server.exe")
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
    llama_server: &Path,
    bearer: &str,
    handshake: &str,
) -> Result<(), String> {
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
        .env("HEMATURIA_LLAMA_SERVER_PATH", llama_server)
        .env("HEMATURIA_DESKTOP_BEARER", bearer)
        .env("HEMATURIA_DESKTOP_HANDSHAKE", handshake)
        .env("HEMATURIA_DESKTOP_ALLOWED_ORIGINS", DESKTOP_ORIGINS);

    if let Some(model_path) = configured_absolute_path("HEMATURIA_DESKTOP_MODEL_PATH")? {
        command.env("HEMATURIA_DESKTOP_MODEL_PATH", model_path);
    }
    if let Some(disabled) = env::var_os("HEMATURIA_DESKTOP_DISABLE_LOCAL_AI") {
        command.env("HEMATURIA_DESKTOP_DISABLE_LOCAL_AI", disabled);
    }
    Ok(())
}

fn validate_ready_message(
    line: &str,
    expected_handshake: &str,
    expected_pid: u32,
) -> Result<ReadyMessage, String> {
    let message: ReadyMessage = serde_json::from_str(line)
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

fn start_sidecar(app: &tauri::App) -> Result<(ManagedSidecar, ReadyMessage, String), String> {
    let layout = resolve_runtime_layout(app)?;
    let data_dir = configured_absolute_path("HEMATURIA_DESKTOP_DATA_DIR")?
        .unwrap_or(app.path().app_local_data_dir().map_err(|error| {
            format!("desktop_local_data_dir_unavailable:{error}")
        })?);
    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|error| format!("desktop_data_dir_create_failed:{error}"))?;
    let database_path = data_dir.join("hematuria.sqlite3");
    let log_file = File::create(logs_dir.join("sidecar-current.log"))
        .map_err(|error| format!("desktop_log_open_failed:{error}"))?;

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
        &layout.llama_server,
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
        .map_err(|error| format!("desktop_sidecar_spawn_failed:{error}"))?;
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
        .map_err(|error| format!("desktop_sidecar_start_gate_failed:{error}"))?;
    let ready = match wait_for_ready(stdout, handshake, child.id()) {
        Ok(ready) => ready,
        Err(error) => {
            let mut managed = ManagedSidecar { child, job };
            managed.shutdown();
            return Err(error);
        }
    };
    Ok((ManagedSidecar { child, job }, ready, bearer))
}

fn runtime_initialization_script(origin: &str, bearer: &str) -> Result<String, String> {
    let value = serde_json::json!({
        "runtimeTarget": "desktop",
        "apiBaseUrl": origin,
        "authToken": bearer
    });
    let serialized = serde_json::to_string(&value)
        .map_err(|_| "desktop_runtime_injection_serialize_failed".to_string())?;
    Ok(format!(
        "Object.defineProperty(globalThis,'__HEMATURIA_DESKTOP_RUNTIME__',{{value:Object.freeze({serialized}),writable:false,configurable:false,enumerable:false}});"
    ))
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>> {
    let (sidecar, ready, bearer) =
        start_sidecar(app).map_err(std::io::Error::other)?;
    let initialization_script =
        runtime_initialization_script(&ready.origin, &bearer).map_err(std::io::Error::other)?;
    app.state::<LifecycleState>()
        .install(sidecar)
        .map_err(std::io::Error::other)?;

    tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("血尿临床问诊训练系统")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .center()
        .resizable(true)
        .devtools(cfg!(debug_assertions))
        .initialization_script(initialization_script)
        .build()?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(LifecycleState::default())
        .setup(setup)
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                window.state::<LifecycleState>().shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run the hematuria desktop application");
}
