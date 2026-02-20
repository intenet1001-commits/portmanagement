use std::fs;
use std::process::Command;
use std::sync::Mutex;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{State, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PortInfo {
    id: String,
    name: String,
    port: u16,
    #[serde(rename = "commandPath")]
    command_path: Option<String>,
    #[serde(rename = "folderPath")]
    folder_path: Option<String>,
    #[serde(rename = "deployUrl")]
    deploy_url: Option<String>,
    #[serde(rename = "githubUrl")]
    github_url: Option<String>,
    #[serde(rename = "isRunning")]
    is_running: bool,
}

struct AppState {
    processes: Mutex<HashMap<String, u32>>,
}

#[tauri::command]
fn load_ports(app_handle: tauri::AppHandle) -> Result<Vec<PortInfo>, String> {
    // Tauri app data 디렉토리 사용
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;

    // 디렉토리가 없으면 생성
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    let ports_file = app_data_dir.join("ports.json");

    if ports_file.exists() {
        let content = fs::read_to_string(&ports_file)
            .map_err(|e| e.to_string())?;
        let ports: Vec<PortInfo> = serde_json::from_str(&content)
            .map_err(|e| e.to_string())?;
        return Ok(ports);
    }

    Ok(Vec::new())
}

#[tauri::command]
fn save_ports(app_handle: tauri::AppHandle, ports: Vec<PortInfo>) -> Result<(), String> {
    // Tauri app data 디렉토리 사용
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;

    // 디렉토리가 없으면 생성
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    let ports_file = app_data_dir.join("ports.json");
    println!("[SavePorts] Saving {} ports to: {:?}", ports.len(), ports_file);

    let content = serde_json::to_string_pretty(&ports)
        .map_err(|e| e.to_string())?;

    fs::write(&ports_file, content)
        .map_err(|e| e.to_string())?;

    println!("[SavePorts] Successfully saved ports");
    Ok(())
}

#[tauri::command]
fn execute_command(
    port_id: String,
    command_path: String,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // 먼저 command 파일이 존재하는지 확인
    let command_path_buf = std::path::PathBuf::from(&command_path);
    if !command_path_buf.exists() {
        println!("[ExecuteCommand] Command file not found: {}", command_path);
        return Err(format!("Command file not found: {}", command_path));
    }
    println!("[ExecuteCommand] Command file exists: {}", command_path);

    // 로그 파일 경로 생성
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;

    let logs_dir = app_data_dir.join("logs");

    // logs 디렉토리가 없으면 생성
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    let log_file = logs_dir.join(format!("{}.log", port_id));
    println!("[ExecuteCommand] Log file: {:?}", log_file);

    // 로그 파일 열기 (append 모드)
    let log_out = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let log_err = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // .command 파일에 실행 권한 부여
    let chmod_result = Command::new("chmod")
        .arg("+x")
        .arg(&command_path)
        .output();

    match chmod_result {
        Ok(out) => {
            if out.status.success() {
                println!("[ExecuteCommand] Successfully set execute permission");
            } else {
                println!("[ExecuteCommand] Warning: chmod failed: {}", String::from_utf8_lossy(&out.stderr));
            }
        }
        Err(e) => {
            println!("[ExecuteCommand] Warning: chmod error: {}", e);
        }
    }

    // 환경변수 설정 (GUI 앱에서 터미널 환경변수 상속)
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/gwanli".to_string());

    // PATH 환경변수에 일반적인 경로들 추가
    let path_additions = vec![
        format!("{}/.cargo/bin", home),
        format!("{}/.bun/bin", home),
        format!("{}/bin", home),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/go/bin".to_string(),
    ];

    let existing_path = std::env::var("PATH").unwrap_or_default();
    let new_path = if existing_path.is_empty() {
        path_additions.join(":")
    } else {
        format!("{}:{}", path_additions.join(":"), existing_path)
    };

    // 프로세스 실행 시 stdout, stderr를 로그 파일로 리다이렉트
    // setsid를 사용하여 새로운 세션으로 실행 (백그라운드 프로세스)
    println!("[ExecuteCommand] Executing: bash {}", command_path);
    println!("[ExecuteCommand] PATH: {}", new_path);

    use std::os::unix::process::CommandExt;

    let mut cmd = Command::new("bash");
    cmd.arg(&command_path)
        .stdout(log_out)
        .stderr(log_err)
        .env("PATH", &new_path)
        .env("HOME", &home);

    // 새로운 프로세스 그룹으로 실행 (백그라운드 데몬화)
    unsafe {
        cmd.pre_exec(|| {
            // 새로운 세션 리더가 되어 부모와 독립적으로 실행
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let pid = child.id();

    let mut processes = state.processes.lock().unwrap();
    processes.insert(port_id.clone(), pid);

    println!("[ExecuteCommand] Started process with PID: {}", pid);

    Ok(format!("Started process with PID: {} (logs: {:?})", pid, log_file))
}

#[tauri::command]
fn stop_command(
    port_id: String,
    port: u16,
    state: State<AppState>,
) -> Result<String, String> {
    println!("[StopCommand] Starting stop for port_id: {}, port: {}", port_id, port);

    let mut processes = state.processes.lock().unwrap();

    // HashMap에서 PID 제거
    let pid_from_map = processes.remove(&port_id);
    drop(processes); // lock 해제

    // 포트로 실행 중인 모든 프로세스 찾기
    let mut killed_pids = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lsof")
            .arg("-ti")
            .arg(format!(":{}", port))
            .output();

        match output {
            Ok(out) => {
                if out.status.success() && !out.stdout.is_empty() {
                    let pid_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    let pids: Vec<&str> = pid_str.lines().collect();

                    if !pids.is_empty() {
                        println!("[StopCommand] Found {} PIDs on port {}: {:?}", pids.len(), port, pids);

                        // 모든 PID 종료
                        for pid_str in pids {
                            if let Ok(pid) = pid_str.parse::<u32>() {
                                println!("[StopCommand] Killing PID: {}", pid);

                                // 먼저 SIGTERM 시도
                                let term_result = Command::new("kill")
                                    .arg("-15")
                                    .arg(pid.to_string())
                                    .output();

                                match term_result {
                                    Ok(output) => {
                                        if output.status.success() {
                                            println!("[StopCommand] SIGTERM sent to PID: {}", pid);
                                            // 잠시 대기
                                            std::thread::sleep(std::time::Duration::from_millis(200));

                                            // 프로세스가 아직 살아있는지 확인
                                            let check = Command::new("kill")
                                                .arg("-0")
                                                .arg(pid.to_string())
                                                .output();

                                            if check.is_ok() && check.unwrap().status.success() {
                                                // 여전히 살아있으면 SIGKILL
                                                println!("[StopCommand] Process still alive, sending SIGKILL to PID: {}", pid);
                                                let _ = Command::new("kill")
                                                    .arg("-9")
                                                    .arg(pid.to_string())
                                                    .output();
                                            }
                                        } else {
                                            // SIGTERM 실패하면 바로 SIGKILL
                                            println!("[StopCommand] SIGTERM failed, sending SIGKILL to PID: {}", pid);
                                            let _ = Command::new("kill")
                                                .arg("-9")
                                                .arg(pid.to_string())
                                                .output();
                                        }
                                        killed_pids.push(pid);
                                    }
                                    Err(e) => {
                                        println!("[StopCommand] Error sending SIGTERM to PID {}: {}", pid, e);
                                        // 에러 나도 SIGKILL 시도
                                        let _ = Command::new("kill")
                                            .arg("-9")
                                            .arg(pid.to_string())
                                            .output();
                                        killed_pids.push(pid);
                                    }
                                }
                            }
                        }
                    } else {
                        println!("[StopCommand] No processes found on port {}", port);
                    }
                } else {
                    println!("[StopCommand] No processes found on port {} (lsof returned empty)", port);
                }
            }
            Err(e) => {
                println!("[StopCommand] Error running lsof: {}", e);
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(pid) = pid_from_map {
            let _ = Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .spawn();
            killed_pids.push(pid);
        }
    }

    if killed_pids.is_empty() {
        if pid_from_map.is_some() {
            println!("[StopCommand] Process from map was removed but not found on port");
            Ok(format!("Process stopped (was in tracking map)"))
        } else {
            println!("[StopCommand] No process found on port {} (already stopped)", port);
            Ok(format!("No process running on port {} (already stopped)", port))
        }
    } else {
        println!("[StopCommand] Successfully stopped {} process(es): {:?}", killed_pids.len(), killed_pids);
        Ok(format!("Stopped {} process(es) with PIDs: {:?}", killed_pids.len(), killed_pids))
    }
}

#[tauri::command]
fn force_restart_command(
    port_id: String,
    port: u16,
    command_path: String,
    state: State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    println!("[ForceRestart] Starting force restart for port_id: {}, port: {}", port_id, port);

    // 1단계: 포트로 실행 중인 모든 프로세스 강제 종료
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lsof")
            .arg("-ti")
            .arg(format!(":{}", port))
            .output();

        match output {
            Ok(out) => {
                if out.status.success() && !out.stdout.is_empty() {
                    let pid_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    let pids: Vec<&str> = pid_str.lines().collect();

                    for pid_str in pids {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            println!("[ForceRestart] Force killing PID: {}", pid);
                            // SIGKILL로 즉시 강제 종료
                            let _ = Command::new("kill")
                                .arg("-9")
                                .arg(pid.to_string())
                                .output();
                        }
                    }
                }
            }
            Err(e) => {
                println!("[ForceRestart] Error running lsof: {}", e);
            }
        }
    }

    // HashMap에서도 제거
    let mut processes = state.processes.lock().unwrap();
    processes.remove(&port_id);
    drop(processes); // lock 해제

    // 잠시 대기 (프로세스가 완전히 종료될 시간)
    std::thread::sleep(std::time::Duration::from_millis(500));

    // 2단계: 새로운 프로세스 시작
    // 먼저 command 파일이 존재하는지 확인
    let command_path_buf = std::path::PathBuf::from(&command_path);
    if !command_path_buf.exists() {
        return Err(format!("Command file not found: {}", command_path));
    }
    println!("[ForceRestart] Command file exists: {}", command_path);

    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;

    let logs_dir = app_data_dir.join("logs");

    // logs 디렉토리가 없으면 생성
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    let log_file = logs_dir.join(format!("{}.log", port_id));
    println!("[ForceRestart] Log file: {:?}", log_file);

    // 로그 파일 열기 (append 모드)
    let log_out = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let log_err = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    // .command 파일에 실행 권한 부여
    let chmod_result = Command::new("chmod")
        .arg("+x")
        .arg(&command_path)
        .output();

    match chmod_result {
        Ok(out) => {
            if out.status.success() {
                println!("[ForceRestart] Successfully set execute permission");
            } else {
                println!("[ForceRestart] Warning: chmod failed: {}", String::from_utf8_lossy(&out.stderr));
            }
        }
        Err(e) => {
            println!("[ForceRestart] Warning: chmod error: {}", e);
        }
    }

    // 환경변수 설정 (GUI 앱에서 터미널 환경변수 상속)
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/gwanli".to_string());

    // PATH 환경변수에 일반적인 경로들 추가
    let path_additions = vec![
        format!("{}/.cargo/bin", home),
        format!("{}/.bun/bin", home),
        format!("{}/bin", home),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/go/bin".to_string(),
    ];

    let existing_path = std::env::var("PATH").unwrap_or_default();
    let new_path = if existing_path.is_empty() {
        path_additions.join(":")
    } else {
        format!("{}:{}", path_additions.join(":"), existing_path)
    };

    // 프로세스 실행 시 stdout, stderr를 로그 파일로 리다이렉트
    // setsid를 사용하여 새로운 세션으로 실행 (백그라운드 프로세스)
    println!("[ForceRestart] Executing: bash {}", command_path);
    println!("[ForceRestart] PATH: {}", new_path);

    use std::os::unix::process::CommandExt;

    let mut cmd = Command::new("bash");
    cmd.arg(&command_path)
        .stdout(log_out)
        .stderr(log_err)
        .env("PATH", &new_path)
        .env("HOME", &home);

    // 새로운 프로세스 그룹으로 실행 (백그라운드 데몬화)
    unsafe {
        cmd.pre_exec(|| {
            // 새로운 세션 리더가 되어 부모와 독립적으로 실행
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let new_pid = child.id();

    let mut processes = state.processes.lock().unwrap();
    processes.insert(port_id.clone(), new_pid);

    println!("[ForceRestart] Successfully restarted with new PID: {}", new_pid);

    Ok(format!("Force restarted on port {} with new PID: {}", port, new_pid))
}

#[tauri::command]
fn check_port_status(port: u16) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lsof")
            .arg("-ti")
            .arg(format!(":{}", port))
            .output();

        match output {
            Ok(out) => {
                let is_running = out.status.success() && !out.stdout.is_empty();
                println!("[CheckPort] Port {} is {}", port, if is_running { "RUNNING" } else { "NOT running" });
                Ok(is_running)
            }
            Err(e) => {
                println!("[CheckPort] Error checking port {}: {}", port, e);
                Ok(false) // 에러가 나면 실행 중이 아닌 것으로 간주
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn detect_port(file_path: String) -> Result<Option<u16>, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| e.to_string())?;

    // localhost:포트 패턴 검색
    if let Some(caps) = regex::Regex::new(r"localhost:(\d+)")
        .unwrap()
        .captures(&content) {
        if let Some(port_str) = caps.get(1) {
            if let Ok(port) = port_str.as_str().parse::<u16>() {
                return Ok(Some(port));
            }
        }
    }

    // PORT=포트 또는 port=포트 패턴 검색
    if let Some(caps) = regex::Regex::new(r"(?:PORT|port)\s*=\s*(\d+)")
        .unwrap()
        .captures(&content) {
        if let Some(port_str) = caps.get(1) {
            if let Ok(port) = port_str.as_str().parse::<u16>() {
                return Ok(Some(port));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
fn open_build_folder() -> Result<String, String> {
    let dmg_folder = "/Users/gwanli/Documents/GitHub/myproduct_v4/포트관리기/src-tauri/target/release/bundle/dmg";

    Command::new("open")
        .arg(dmg_folder)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok("폴더를 열었습니다".to_string())
}

#[tauri::command]
fn export_dmg() -> Result<String, String> {
    use std::path::Path;

    let project_dir = "/Users/gwanli/Documents/GitHub/myproduct_v4/포트관리기";
    let bundle_dir = format!("{}/src-tauri/target/release/bundle", project_dir);

    // DMG 파일 찾기
    let dmg_paths = vec![
        format!("{}/dmg 2", bundle_dir),
        format!("{}/dmg", bundle_dir),
        format!("{}/macos", bundle_dir),
    ];

    let mut dmg_file: Option<String> = None;

    for dmg_dir in dmg_paths {
        if let Ok(entries) = fs::read_dir(&dmg_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "dmg" && !path.file_name().unwrap().to_str().unwrap().starts_with("rw.") {
                        dmg_file = Some(path.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }
        if dmg_file.is_some() {
            break;
        }
    }

    match dmg_file {
        Some(dmg_path) => {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/gwanli".to_string());
            let desktop = format!("{}/Desktop", home);

            // 원본 파일명 추출 (버전 정보 포함)
            let dmg_filename = Path::new(&dmg_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("포트관리기.dmg");

            let dest_path = format!("{}/{}", desktop, dmg_filename);

            // 기존 파일이 있으면 삭제
            if Path::new(&dest_path).exists() {
                fs::remove_file(&dest_path)
                    .map_err(|e| format!("기존 파일 삭제 실패: {}", e))?;
            }

            // DMG 복사
            fs::copy(&dmg_path, &dest_path)
                .map_err(|e| format!("DMG 복사 실패: {}", e))?;

            // Desktop 폴더 열기
            Command::new("open")
                .arg(&desktop)
                .spawn()
                .map_err(|e| e.to_string())?;

            Ok(format!("DMG를 Desktop에 복사했습니다: {}", dest_path))
        }
        None => Err("DMG 파일을 찾을 수 없습니다. 먼저 빌드를 실행하세요.".to_string())
    }
}

#[tauri::command]
fn open_folder(folder_path: String) -> Result<String, String> {
    if folder_path.is_empty() {
        return Err("폴더 경로가 비어 있습니다".to_string());
    }

    Command::new("open")
        .arg(&folder_path)
        .spawn()
        .map_err(|e| format!("폴더 열기 실패: {}", e))?;

    Ok(format!("폴더를 열었습니다: {}", folder_path))
}

#[tauri::command]
fn open_log(port_id: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    // 로그 파일 경로 생성
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;

    let logs_dir = app_data_dir.join("logs");

    // logs 디렉토리가 없으면 생성
    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    let log_file = logs_dir.join(format!("{}.log", port_id));

    // 로그 파일이 없으면 생성
    if !log_file.exists() {
        fs::write(&log_file, "로그가 아직 생성되지 않았습니다.\n")
            .map_err(|e| format!("Failed to create log file: {}", e))?;
    }

    println!("[OpenLog] Opening log file: {:?}", log_file);

    #[cfg(target_os = "macos")]
    {
        // Terminal에서 tail -f로 로그 팔로우
        let log_path_str = log_file.to_string_lossy().to_string();
        let script = format!(
            "tell application \"Terminal\"\n  do script \"tail -f '{}'\"\n  activate\nend tell",
            log_path_str
        );

        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // 다른 OS에서는 기본 텍스트 에디터로 열기
        Command::new("xdg-open")
            .arg(log_file.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open log file: {}", e))?;
    }

    Ok(format!("로그 파일을 열었습니다: {:?}", log_file))
}

#[tauri::command]
fn open_in_chrome(url: String) -> Result<String, String> {
    if url.is_empty() {
        return Err("URL이 비어 있습니다".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-a")
            .arg("Google Chrome")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Chrome 열기 실패: {}", e))?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        Command::new("google-chrome")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Chrome 열기 실패: {}", e))?;
    }

    Ok(format!("Chrome에서 열었습니다: {}", url))
}

#[tauri::command]
fn import_ports_from_file(file_path: String) -> Result<Vec<PortInfo>, String> {
    // 파일이 존재하는지 확인
    let path = std::path::PathBuf::from(&file_path);
    if !path.exists() {
        return Err("파일이 존재하지 않습니다".to_string());
    }

    // 파일 읽기
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("파일 읽기 실패: {}", e))?;

    // JSON 파싱
    let ports: Vec<PortInfo> = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 파싱 실패: {}", e))?;

    Ok(ports)
}

#[tauri::command]
fn install_app_to_applications() -> Result<String, String> {
    let app_path = "/Users/gwanli/Documents/GitHub/myproduct_v4/포트관리기/src-tauri/target/release/bundle/macos/포트관리기.app";
    let dest_path = "/Applications/포트관리기.app";

    // 기존 앱이 있으면 삭제
    if std::path::Path::new(dest_path).exists() {
        Command::new("rm")
            .arg("-rf")
            .arg(dest_path)
            .spawn()
            .map_err(|e| format!("기존 앱 삭제 실패: {}", e))?
            .wait()
            .map_err(|e| format!("기존 앱 삭제 대기 실패: {}", e))?;
    }

    // 앱 복사
    Command::new("cp")
        .arg("-R")
        .arg(app_path)
        .arg(dest_path)
        .spawn()
        .map_err(|e| format!("앱 복사 실패: {}", e))?
        .wait()
        .map_err(|e| format!("앱 복사 대기 실패: {}", e))?;

    Ok("앱이 Applications 폴더에 설치되었습니다".to_string())
}

#[tauri::command]
async fn build_app(build_type: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot get parent directory")?
        .parent()
        .ok_or("Cannot get project directory")?
        .to_path_buf();

    let command = if build_type == "dmg" {
        vec!["bun", "run", "tauri:build:dmg"]
    } else {
        vec!["bun", "run", "tauri:build"]
    };

    std::thread::spawn(move || {
        let _ = Command::new(command[0])
            .args(&command[1..])
            .current_dir(app_dir)
            .spawn();
    });

    Ok(format!("{} 빌드가 백그라운드에서 시작되었습니다", build_type))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
        processes: Mutex::new(HashMap::new()),
    })
    .invoke_handler(tauri::generate_handler![
        load_ports,
        save_ports,
        execute_command,
        stop_command,
        force_restart_command,
        detect_port,
        check_port_status,
        build_app,
        install_app_to_applications,
        open_build_folder,
        open_folder,
        import_ports_from_file,
        open_in_chrome,
        open_log,
        export_dmg,
    ])
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
