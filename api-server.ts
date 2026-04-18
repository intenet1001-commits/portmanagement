import { spawn } from "bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** Escape single quotes for use inside single-quoted shell strings: ' → '\'' */
const escapeSq = (s: string): string => s.replace(/'/g, "'\\''");

const IS_WIN = process.platform === 'win32';

/** 포트를 사용 중인 PID 목록 반환 (Windows/macOS 공용) */
async function getPidsByPort(port: number): Promise<string[]> {
  if (IS_WIN) {
    const proc = spawn({
      cmd: ['powershell', '-NoProfile', '-NonInteractive', '-Command',
        `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique`],
      stdout: 'pipe', stderr: 'pipe',
    });
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    return out.trim().split('\n').map(p => p.trim()).filter(p => /^\d+$/.test(p));
  } else {
    const proc = spawn({ cmd: ['lsof', '-ti', `:${port}`], stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    const out = await new Response(proc.stdout).text();
    return out.trim().split('\n').filter(p => p.length > 0);
  }
}

/** PID 종료 (Windows/macOS 공용) */
async function killPid(pid: string, force = false): Promise<void> {
  if (IS_WIN) {
    spawn({ cmd: ['taskkill', '/F', '/PID', pid], stdout: 'pipe', stderr: 'pipe' });
    await new Promise(r => setTimeout(r, 100));
  } else {
    const sig = force ? '-9' : '-15';
    const p = spawn({ cmd: ['kill', sig, pid], stdout: 'inherit', stderr: 'inherit' });
    await p.exited;
  }
}

/** 폴더/파일 열기 (Windows/macOS 공용) */
function openPath(target: string): void {
  if (IS_WIN) {
    spawn({ cmd: ['explorer.exe', target], stdout: 'inherit', stderr: 'inherit' });
  } else {
    spawn({ cmd: ['open', target], stdout: 'inherit', stderr: 'inherit' });
  }
}

// Resolve claude binary path once at startup (Homebrew first, then PATH fallback)
function resolveClaudePath(): string | null {
  if (existsSync('/opt/homebrew/bin/claude')) return '/opt/homebrew/bin/claude';
  if (existsSync('/usr/local/bin/claude')) return '/usr/local/bin/claude';
  const isWin = process.platform === 'win32';
  const finder = isWin ? ['where', 'claude'] : ['which', 'claude'];
  const result = Bun.spawnSync(finder, { env: { ...process.env } });
  const resolved = result.stdout.toString().trim().split('\n')[0].trim();
  return resolved || null;
}
const CLAUDE_PATH = resolveClaudePath();

const executableProcesses = new Map<string, any>();
let buildProcess: any = null;
let buildStatus = { isBuilding: false, type: '', output: [] as string[], exitCode: null as number | null };

// GitHub Actions 설정
const GITHUB_OWNER = 'intenet1001-commits';
const GITHUB_REPO = 'portmanagement';
const GITHUB_WORKFLOW = 'build-windows.yml';

// 포트 데이터 파일 - 앱과 동일한 위치 사용
const APP_DATA_DIR = join(homedir(), "Library/Application Support/com.portmanager.portmanager");
const PORTS_DATA_FILE = join(APP_DATA_DIR, "ports.json");
const WORKSPACE_ROOTS_FILE = join(APP_DATA_DIR, "workspace-roots.json");
const PORTAL_DATA_FILE = join(APP_DATA_DIR, "portal.json");

// 다른 기기에서 동기된 경로를 현재 기기 경로로 자동 수정
function remapPathsToCurrentUser(ports: any[]): { ports: any[]; changed: boolean } {
  const home = homedir();
  const homeMatch = home.match(/^\/Users\/([^/]+)/);
  if (!homeMatch) return { ports, changed: false };
  const currentUser = homeMatch[1];

  let changed = false;
  const remapped = ports.map((p: any) => {
    const fix = (path?: string) => {
      if (!path || !path.startsWith('/Users/')) return path;
      const m = path.match(/^\/Users\/([^/]+)(\/.*)?$/);
      if (!m || m[1] === currentUser) return path;
      const candidate = `/Users/${currentUser}${m[2] ?? ''}`;
      if (existsSync(candidate)) { changed = true; return candidate; }
      return path;
    };
    return { ...p, folderPath: fix(p.folderPath), commandPath: fix(p.commandPath) };
  });
  return { ports: remapped, changed };
}

// 포트 데이터 로드
async function loadPortsData() {
  try {
    const file = Bun.file(PORTS_DATA_FILE);
    if (await file.exists()) {
      const data = await file.json();
      const { ports: remapped, changed } = remapPathsToCurrentUser(data);
      if (changed) {
        console.log('[Data] Auto-remapped paths to current user home dir — saving');
        await Bun.write(PORTS_DATA_FILE, JSON.stringify(remapped, null, 2));
      }
      return remapped;
    }
  } catch (error) {
    console.error("[Data] Error loading ports data:", error);
  }
  return [];
}

// 포트 데이터 저장
async function savePortsData(data: any) {
  try {
    // 디렉토리가 없으면 생성
    if (!existsSync(APP_DATA_DIR)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(APP_DATA_DIR, { recursive: true });
      console.log("[Data] Created app data directory:", APP_DATA_DIR);
    }

    await Bun.write(PORTS_DATA_FILE, JSON.stringify(data, null, 2));
    console.log("[Data] Ports data saved successfully to:", PORTS_DATA_FILE);
    return true;
  } catch (error) {
    console.error("[Data] Error saving ports data:", error);
    return false;
  }
}

// 작업 루트 데이터 로드
async function loadWorkspaceRootsData() {
  try {
    const file = Bun.file(WORKSPACE_ROOTS_FILE);
    if (await file.exists()) return await file.json();
  } catch (e) { console.error("[Data] Error loading workspace roots:", e); }
  return [];
}

// 작업 루트 데이터 저장
async function saveWorkspaceRootsData(data: any) {
  try {
    if (!existsSync(APP_DATA_DIR)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    await Bun.write(WORKSPACE_ROOTS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) { console.error("[Data] Error saving workspace roots:", e); return false; }
}

const server = Bun.serve({
  port: 3001,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);

    // CORS 헤더 설정
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // API 라우팅
    if (url.pathname === "/api/ports" && req.method === "GET") {
      try {
        const data = await loadPortsData();
        return new Response(JSON.stringify(data), { headers });
      } catch (error: any) {
        console.error("[API] Error loading ports:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/ports" && req.method === "POST") {
      try {
        const data = await req.json();
        const success = await savePortsData(data);

        if (success) {
          return new Response(
            JSON.stringify({ success: true }),
            { headers }
          );
        } else {
          return new Response(
            JSON.stringify({ error: "Failed to save data" }),
            { status: 500, headers }
          );
        }
      } catch (error: any) {
        console.error("[API] Error saving ports:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/detect-port" && req.method === "POST") {
      try {
        const { filePath } = await req.json();

        if (!filePath) {
          return new Response(
            JSON.stringify({ error: "Missing filePath" }),
            { status: 400, headers }
          );
        }

        // 파일 읽기
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return new Response(
            JSON.stringify({ error: "File not found" }),
            { status: 404, headers }
          );
        }

        const content = await file.text();
        let detectedPort = null;

        // localhost:포트 패턴 검색
        const localhostMatch = content.match(/localhost:(\d+)/);
        if (localhostMatch) {
          detectedPort = parseInt(localhostMatch[1]);
        } else {
          // PORT=포트 또는 port=포트 패턴 검색
          const portMatch = content.match(/(?:PORT|port)\s*=\s*(\d+)/);
          if (portMatch) {
            detectedPort = parseInt(portMatch[1]);
          }
        }

        // 폴더 경로 추출
        let folderPath = null;
        const lastSlashIndex = filePath.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          folderPath = filePath.substring(0, lastSlashIndex);
        }

        // 프로젝트 이름 추출
        let projectName = null;
        if (lastSlashIndex !== -1) {
          const fileName = filePath.substring(lastSlashIndex + 1);
          projectName = fileName.replace('.command', '').replace('.sh', '');
        }

        console.log(`[DetectPort] File: ${filePath}, Port: ${detectedPort}, Folder: ${folderPath}, Name: ${projectName}`);

        return new Response(
          JSON.stringify({
            detectedPort,
            folderPath,
            projectName,
            commandPath: filePath
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[DetectPort] Error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/execute-command" && req.method === "POST") {
      try {
        const { portId, commandPath } = await req.json();

        console.log(`[Execute] Received request for portId: ${portId}, path: ${commandPath}`);

        if (!commandPath || !portId) {
          return new Response(
            JSON.stringify({ error: "Missing portId or commandPath" }),
            { status: 400, headers }
          );
        }

        // 기존 프로세스가 실행 중이면 종료
        const existingProc = executableProcesses.get(portId);
        if (existingProc) {
          console.log(`[Execute] Killing existing process for portId: ${portId}`);
          try {
            existingProc.kill();
          } catch (e) {
            console.error(`[Execute] Error killing process:`, e);
          }
        }

        // .html 파일은 브라우저로 열기
        if (commandPath.toLowerCase().endsWith('.html')) {
          if (IS_WIN) {
            spawn({ cmd: ['cmd', '/c', 'start', '', commandPath], stdout: 'inherit', stderr: 'inherit' });
          } else {
            try { Bun.spawnSync(['open', '-a', 'Google Chrome', commandPath]); }
            catch { Bun.spawnSync(['open', commandPath]); }
          }
          return new Response(JSON.stringify({ success: true, message: 'Opened HTML in browser' }), { headers });
        }

        // 파일 경로 vs raw 커맨드 판별
        const isFilePath = IS_WIN
          ? /^([A-Za-z]:[\\\/]|\\\\|~)/.test(commandPath)
          : commandPath.startsWith('/') || commandPath.startsWith('~');
        // 파일 경로인 경우 존재 여부 확인
        if (isFilePath && !existsSync(commandPath)) {
          return new Response(
            JSON.stringify({ error: `파일을 찾을 수 없습니다: ${commandPath}` }),
            { status: 400, headers }
          );
        }
        // Windows: .bat/.cmd는 cmd /c로, 그 외는 raw command 실행
        const cmd = IS_WIN
          ? (isFilePath
              ? ['cmd', '/c', commandPath]
              : ['cmd', '/c', commandPath])
          : (isFilePath ? ['bash', commandPath] : ['bash', '-c', commandPath]);
        console.log(`[Execute] Starting process: ${cmd.join(' ')}`);

        const proc = spawn({
          cmd,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "ignore",
        });

        executableProcesses.set(portId, proc);

        console.log(`[Execute] Process started successfully with PID: ${proc.pid}`);

        // 프로세스 종료 시 처리
        proc.exited.then((code) => {
          console.log(`[Execute] Process for portId ${portId} exited with code: ${code}`);
          executableProcesses.delete(portId);
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Command started",
            portId,
            pid: proc.pid,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[Execute] Error:`, error);
        return new Response(
          JSON.stringify({
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/stop-command" && req.method === "POST") {
      try {
        const { portId, port } = await req.json();

        console.log(`[Stop] Received stop request for portId: ${portId}, port: ${port}`);

        if (!portId) {
          return new Response(
            JSON.stringify({ error: "Missing portId" }),
            { status: 400, headers }
          );
        }

        const killedPids: string[] = [];

        // Map에서 프로세스 제거
        const proc = executableProcesses.get(portId);
        if (proc) {
          console.log(`[Stop] Killing process from map for portId: ${portId}, PID: ${proc.pid}`);
          try {
            proc.kill();
            executableProcesses.delete(portId);
            console.log(`[Stop] Process killed successfully`);
          } catch (e) {
            console.error(`[Stop] Error killing process:`, e);
          }
        }

        // 포트로 실행 중인 모든 프로세스 찾기
        if (port) {
          console.log(`[Stop] Searching for all processes on port: ${port}`);
          try {
            const pids = await getPidsByPort(port);
            if (pids.length > 0) {
              console.log(`[Stop] Found ${pids.length} PIDs on port ${port}:`, pids);
              for (const pid of pids) {
                await killPid(pid, false);
                await new Promise(r => setTimeout(r, 200));
                // macOS only: check if still alive then force kill
                if (!IS_WIN) {
                  const check = spawn({ cmd: ['kill', '-0', pid], stdout: 'pipe', stderr: 'pipe' });
                  await check.exited;
                  if (check.exitCode === 0) await killPid(pid, true);
                }
                killedPids.push(pid);
              }
              console.log(`[Stop] Successfully killed ${killedPids.length} process(es)`);
            } else {
              console.log(`[Stop] No process found on port ${port}`);
            }
          } catch (e) {
            console.error(`[Stop] Error finding/killing process by port:`, e);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: killedPids.length > 0
              ? `Stopped ${killedPids.length} process(es)`
              : "No process running (already stopped)",
            killedPids,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[Stop] Error:`, error);
        return new Response(
          JSON.stringify({
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/force-restart-command" && req.method === "POST") {
      try {
        const { portId, port, commandPath } = await req.json();

        console.log(`[ForceRestart] Received request for portId: ${portId}, port: ${port}, path: ${commandPath}`);

        if (!portId || !port || !commandPath) {
          return new Response(
            JSON.stringify({ error: "Missing portId, port, or commandPath" }),
            { status: 400, headers }
          );
        }

        // 1단계: 포트로 실행 중인 모든 프로세스 강제 종료
        console.log(`[ForceRestart] Killing all processes on port ${port}`);

        // Map에서도 제거
        const proc = executableProcesses.get(portId);
        if (proc) {
          console.log(`[ForceRestart] Killing process from map, PID: ${proc.pid}`);
          try {
            proc.kill();
            executableProcesses.delete(portId);
          } catch (e) {
            console.error(`[ForceRestart] Error killing process from map:`, e);
          }
        }

        // 포트를 사용하는 모든 프로세스 강제 종료 (Windows/macOS 공용)
        try {
          const pids = await getPidsByPort(port);
          if (pids.length > 0) {
            console.log(`[ForceRestart] Found PIDs on port ${port}:`, pids);
            for (const pid of pids) {
              await killPid(pid, true);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`[ForceRestart] Successfully killed all processes on port ${port}`);
          } else {
            console.log(`[ForceRestart] No process found on port ${port}`);
          }
        } catch (e) {
          console.error(`[ForceRestart] Error finding/killing process by port:`, e);
        }

        // 2단계: 새로운 프로세스 시작 (파일 경로 vs raw 커맨드 판별)
        const isFilePath = IS_WIN
          ? /^([A-Za-z]:[\\\/]|\\\\|~)/.test(commandPath)
          : commandPath.startsWith('/') || commandPath.startsWith('~');
        const restartCmd = IS_WIN
          ? ['cmd', '/c', commandPath]
          : (isFilePath ? ['bash', commandPath] : ['bash', '-c', commandPath]);
        console.log(`[ForceRestart] Starting new process: ${restartCmd.join(' ')}`);

        const newProc = spawn({
          cmd: restartCmd,
          stdout: "inherit",
          stderr: "inherit",
          stdin: "ignore",
        });

        executableProcesses.set(portId, newProc);

        console.log(`[ForceRestart] Process restarted successfully with PID: ${newProc.pid}`);

        // 프로세스 종료 시 처리
        newProc.exited.then((code) => {
          console.log(`[ForceRestart] Process for portId ${portId} exited with code: ${code}`);
          executableProcesses.delete(portId);
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Force restarted on port ${port}`,
            portId,
            pid: newProc.pid,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[ForceRestart] Error:`, error);
        return new Response(
          JSON.stringify({
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/check-port-status" && req.method === "POST") {
      try {
        const { port } = await req.json();

        if (!port) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing port" }),
            { status: 400, headers }
          );
        }

        // 포트 상태 확인 (Windows/macOS 공용)
        const pids = await getPidsByPort(port);
        const isRunning = pids.length > 0;

        console.log(`[CheckPortStatus] Port ${port} is ${isRunning ? 'RUNNING' : 'NOT running'}`);

        return new Response(
          JSON.stringify({
            success: true,
            isRunning,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[CheckPortStatus] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/open-add-command" && req.method === "POST") {
      try {
        const scriptPath = join(import.meta.dir, "포트에추가.command");

        console.log(`[OpenAddCommand] Attempting to open: ${scriptPath}`);

        // 파일 존재 여부 확인
        const file = Bun.file(scriptPath);
        const fileExists = await file.exists();

        if (!fileExists) {
          console.error(`[OpenAddCommand] File not found: ${scriptPath}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `파일을 찾을 수 없습니다: ${scriptPath}`,
            }),
            { status: 404, headers }
          );
        }

        console.log(`[OpenAddCommand] File exists, opening...`);

        // macOS에서 .command 파일 열기
        spawn({
          cmd: ["open", scriptPath],
          stdout: "inherit",
          stderr: "inherit",
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Opened 포트에추가.command",
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[OpenAddCommand] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/build" && req.method === "POST") {
      try {
        const { type } = await req.json(); // type: 'build' or 'dmg'

        if (buildStatus.isBuilding) {
          return new Response(
            JSON.stringify({ error: "빌드가 이미 진행 중입니다" }),
            { status: 400, headers }
          );
        }

        buildStatus = { isBuilding: true, type, output: [], exitCode: null };

        const buildCommand = type === 'dmg' ? 'tauri:build:dmg' : 'tauri:build';

        console.log(`[Build] Starting ${type} build...`);

        // bash를 통해 cargo 환경을 설정하고 실행
        buildProcess = spawn({
          cmd: ["bash", "-c", `source "$HOME/.cargo/env" && cd "${import.meta.dir}" && bun run ${buildCommand}`],
          stdout: "pipe",
          stderr: "pipe",
        });

        // 출력 스트림 읽기 (스트림이 완전히 드레인된 후 상태 업데이트)
        const readStream = async (stream: any, isStderr = false) => {
          const decoder = new TextDecoder();
          for await (const chunk of stream) {
            const text = decoder.decode(chunk);
            buildStatus.output.push(text);
            if (isStderr) {
              console.error(`[Build] ${text}`);
            } else {
              console.log(`[Build] ${text}`);
            }
          }
        };

        const stdoutDone = readStream(buildProcess.stdout, false);
        const stderrDone = readStream(buildProcess.stderr, true);

        // 프로세스 종료 대기 - 스트림이 모두 닫힌 후에 상태 업데이트
        buildProcess.exited.then(async (code: number) => {
          await Promise.all([stdoutDone, stderrDone]); // 스트림 완전 드레인 후
          buildStatus.exitCode = code;
          buildStatus.isBuilding = false;
          console.log(`[Build] Process exited with code: ${code}`);
        });

        return new Response(
          JSON.stringify({ success: true, message: `${type} 빌드가 시작되었습니다` }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[Build] Error:`, error);
        buildStatus.isBuilding = false;
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/build-status" && req.method === "GET") {
      return new Response(
        JSON.stringify(buildStatus),
        { headers }
      );
    }

    if (url.pathname === "/api/build-reset" && req.method === "POST") {
      if (buildProcess) {
        try { buildProcess.kill(); } catch {}
      }
      buildStatus = { isBuilding: false, type: '', output: ['⚠️ 빌드가 강제 초기화되었습니다.'], exitCode: null };
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (url.pathname === "/api/open-build-folder" && req.method === "POST") {
      try {
        // .cargo/config.toml의 target-dir 설정과 동일한 경로 (iCloud 밖)
        const dmgFolder = join(process.env.HOME || "", "cargo-targets/portmanager/release/bundle/dmg");

        console.log(`[OpenBuildFolder] Attempting to open: ${dmgFolder}`);

        // macOS에서 폴더 열기
        spawn({
          cmd: ["open", dmgFolder],
          stdout: "inherit",
          stderr: "inherit",
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "빌드 폴더를 열었습니다",
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[OpenBuildFolder] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/project-path" && req.method === "GET") {
      return new Response(JSON.stringify({ path: process.cwd() }), { headers });
    }

    if (url.pathname === "/api/pick-folder" && req.method === "GET") {
      try {
        let picked = '';
        if (IS_WIN) {
          // Windows: PowerShell FolderBrowserDialog
          const ps = Bun.spawn({
            cmd: ['powershell', '-NoProfile', '-NonInteractive', '-Command',
              `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '폴더 선택'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }`],
            stdout: 'pipe', stderr: 'pipe',
          });
          await ps.exited;
          picked = (await new Response(ps.stdout).text()).trim();
        } else {
          const proc = Bun.spawn({
            cmd: ['osascript', '-e', 'POSIX path of (choose folder)'],
            stdout: 'pipe', stderr: 'pipe',
          });
          await proc.exited;
          picked = (await new Response(proc.stdout).text()).trim();
        }
        if (!picked) {
          return new Response(JSON.stringify({ error: 'cancelled' }), { status: 400, headers });
        }
        return new Response(JSON.stringify({ path: picked }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-folder" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();

        console.log(`[OpenFolder] Attempting to open: ${folderPath}`);

        if (!folderPath) {
          return new Response(
            JSON.stringify({ error: "Missing folderPath" }),
            { status: 400, headers }
          );
        }

        // 절대 경로 확인 (Windows: C:\... or \\..., macOS: /...)
        const isAbsolute = IS_WIN
          ? /^([A-Za-z]:[\\\/]|\\\\)/.test(folderPath)
          : folderPath.startsWith('/');
        if (!isAbsolute) {
          return new Response(
            JSON.stringify({ error: `절대 경로가 필요합니다: "${folderPath}"` }),
            { status: 400, headers }
          );
        }

        // 경로 존재 여부 확인
        if (!existsSync(folderPath)) {
          return new Response(
            JSON.stringify({ error: `폴더를 찾을 수 없습니다: "${folderPath}"` }),
            { status: 404, headers }
          );
        }

        openPath(folderPath);

        return new Response(
          JSON.stringify({
            success: true,
            message: "폴더를 열었습니다",
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[OpenFolder] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    // ── Terminal/tmux helper (Windows: wt.exe or cmd, macOS: iTerm) ─────────
    function openTerminalWithCmd(shellCmd: string, folderPath: string | null, title: string): void {
      if (IS_WIN) {
        // Windows Terminal 우선, 없으면 cmd 폴백
        const wtArgs = folderPath
          ? ['wt.exe', '-d', folderPath, '--title', title, '--', 'cmd', '/k', shellCmd]
          : ['wt.exe', '--title', title, '--', 'cmd', '/k', shellCmd];
        const wt = Bun.spawnSync(['where', 'wt.exe'], { stdout: 'pipe', stderr: 'pipe' });
        if (wt.exitCode === 0) {
          spawn({ cmd: wtArgs, stdout: 'inherit', stderr: 'inherit' });
        } else {
          // fallback: start cmd
          const cdPart = folderPath ? `cd /d "${folderPath}" && ` : '';
          spawn({ cmd: ['cmd', '/c', 'start', `"${title}"`, 'cmd', '/k', `${cdPart}${shellCmd}`],
            stdout: 'inherit', stderr: 'inherit' });
        }
      } else {
        const escCmd = shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const escTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cdPart = folderPath ? `write text "cd '${escapeSq(folderPath)}'"\n    ` : '';
        const script = `tell application "iTerm"\n  activate\n  set w to create window with default profile\n  tell current session of w\n    ${cdPart}write text "${escCmd}"\n    delay 0.3\n    set name to "${escTitle}"\n  end tell\nend tell`;
        spawn({ cmd: ['osascript', '-e', script], stdout: 'inherit', stderr: 'inherit' });
      }
    }

    if (url.pathname === "/api/open-tmux-claude" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();
        const claudeCmd = IS_WIN
          ? (worktreePath ? `claude -w "${worktreePath}"` : 'claude')
          : `tmux new-session -A -s '${escapeSq(sessionName)}' '${worktreePath ? `claude -w '${escapeSq(worktreePath)}'` : 'claude'}'`;
        openTerminalWithCmd(claudeCmd, folderPath ?? null, `[tmux] ${sessionName}`);
        return new Response(JSON.stringify({ success: true, message: `Claude 실행 중 (세션: ${sessionName})` }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-tmux-claude-fresh" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();
        const claudeCmd = IS_WIN
          ? (worktreePath ? `claude -w "${worktreePath}"` : 'claude')
          : `tmux kill-session -t '${escapeSq(sessionName)}' 2>/dev/null; tmux new-session -s '${escapeSq(sessionName)}' '${worktreePath ? `claude -w '${escapeSq(worktreePath)}'` : 'claude'}'`;
        openTerminalWithCmd(claudeCmd, folderPath ?? null, `[fresh] ${sessionName}`);
        return new Response(JSON.stringify({ success: true, message: `Claude 새 세션 시작 (${sessionName})` }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-tmux-claude-bypass" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();
        const claudeCmd = IS_WIN
          ? (worktreePath ? `claude --dangerously-skip-permissions -w "${worktreePath}"` : 'claude --dangerously-skip-permissions')
          : `tmux new-session -A -s '${escapeSq(sessionName)}-bypass' '${worktreePath ? `claude --dangerously-skip-permissions -w '${escapeSq(worktreePath)}'` : 'claude --dangerously-skip-permissions'}'`;
        openTerminalWithCmd(claudeCmd, folderPath ?? null, `[bypass] ${sessionName}`);
        return new Response(JSON.stringify({ success: true, message: `Claude bypass 실행 중 (${sessionName})` }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/run-claude-with-prompt" && req.method === "POST") {
      try {
        const { folderPath, prompt } = await req.json();
        openTerminalWithCmd('claude', folderPath ?? null, 'Claude');
        // Windows: prompt auto-send not supported via wt.exe (no stdin injection)
        const msg = IS_WIN
          ? 'Claude 실행됨 (Windows — 프롬프트 자동 전송 불가, 직접 입력하세요)'
          : 'Claude 실행 + 프롬프트 자동 전송';
        return new Response(JSON.stringify({ success: true, message: msg }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-claude" && req.method === "POST") {
      try {
        const { folderPath, name, worktreePath } = await req.json();
        const claudeCmd = worktreePath
          ? (IS_WIN ? `claude -w "${worktreePath}"` : `claude -w '${escapeSq(worktreePath)}'`)
          : 'claude';
        openTerminalWithCmd(claudeCmd, folderPath ?? null, name || 'Claude');
        return new Response(JSON.stringify({ success: true, message: 'Terminal에서 Claude 실행' }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-claude-bypass" && req.method === "POST") {
      try {
        const { folderPath, name, worktreePath } = await req.json();
        const claudeCmd = worktreePath
          ? (IS_WIN ? `claude --dangerously-skip-permissions -w "${worktreePath}"` : `claude --dangerously-skip-permissions -w '${escapeSq(worktreePath)}'`)
          : 'claude --dangerously-skip-permissions';
        openTerminalWithCmd(claudeCmd, folderPath ?? null, `[bypass] ${name || 'Claude'}`);
        return new Response(JSON.stringify({ success: true, message: 'Terminal에서 Claude (bypass) 실행' }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/supabase-login" && req.method === "POST") {
      try {
        const isWindows = process.platform === "win32";
        if (isWindows) {
          // Windows: PowerShell 창 열고 supabase login 실행
          const supabaseBin = join(homedir(), ".bun/install/global/node_modules/supabase/bin/supabase.exe");
          const cmd = existsSync(supabaseBin) ? `& "${supabaseBin}" login` : "supabase login";
          spawn({
            cmd: ["powershell.exe", "-NoExit", "-Command", cmd],
            stdout: "inherit",
            stderr: "inherit",
          });
        } else {
          // macOS: Terminal 창 열고 supabase login 실행
          const script = `tell application "Terminal"\n  activate\n  do script "supabase login"\nend tell`;
          spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-git-pull" && req.method === "POST") {
      try {
        const { folderPath, name, githubUrl } = await req.json();
        // pull은 항상 메인 folderPath에서 실행
        const workDir = folderPath as string;
        const baseName = (name || 'git-pull') as string;
        const displayName = baseName;
        const title = `[git-pull] ${displayName}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // GitHub URL이 있으면 origin remote 보장
        const remoteCmd = githubUrl
          ? `git remote set-url origin '${escapeSq(githubUrl as string)}' 2>/dev/null || git remote add origin '${escapeSq(githubUrl as string)}'; `
          : '';
        const cmd = `cd '${escapeSq(workDir)}' && printf '\\033]0;${title}\\007' && ${remoteCmd}git pull`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "터미널에서 git pull 실행" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-git-push" && req.method === "POST") {
      try {
        const { folderPath, name, githubUrl } = await req.json();
        // push는 항상 메인 folderPath에서 실행
        const workDir = folderPath as string;
        const baseName = (name || 'git-push') as string;
        const displayName = baseName;
        const title = `[git-push] ${displayName}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // GitHub URL이 있으면 origin remote 보장
        const remoteCmd = githubUrl
          ? `git remote set-url origin '${escapeSq(githubUrl as string)}' 2>/dev/null || git remote add origin '${escapeSq(githubUrl as string)}'; `
          : '';
        const cmd = `cd '${escapeSq(workDir)}' && printf '\\033]0;${title}\\007' && ${remoteCmd}git push || git push --set-upstream origin $(git branch --show-current)`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "터미널에서 git push 실행" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-git-commit" && req.method === "POST") {
      try {
        const { worktreePath, folderPath, name } = await req.json();
        // 커밋은 worktreePath 우선, 없으면 folderPath
        const workDir = (worktreePath as string | undefined) || (folderPath as string);
        const baseName = (name || 'git-commit') as string;
        const worktreeName = worktreePath
          ? (worktreePath as string).replace(/\/$/, '').split('/').pop()
          : null;
        const displayName = worktreeName ? `${baseName}(${worktreeName})` : baseName;
        const title = `[git-commit] ${displayName}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // git add -A → commit (메시지 입력 프롬프트)
        const cmd = `cd '${escapeSq(workDir)}' && printf '\\033]0;${title}\\007' && git add -A && git status && echo "" && read -p "커밋 메시지: " msg && git commit -m "$msg"`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "터미널에서 git commit 실행" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-in-chrome" && req.method === "POST") {
      try {
        const { url: targetUrl } = await req.json();
        if (!targetUrl) return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers });
        spawn({ cmd: ["open", "-a", "Google Chrome", targetUrl as string], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-worktree-run" && req.method === "POST") {
      try {
        const { worktreePath, name, terminalCommand, port, folderPath } = await req.json();
        if (!worktreePath) {
          return new Response(JSON.stringify({ error: "worktreePath required" }), { status: 400, headers });
        }
        const workDir = worktreePath as string;
        const baseName = (name || 'run') as string;
        const wtName = workDir.replace(/\/$/, '').split('/').pop() || baseName;
        const portLabel = port ? `(${port})` : '';
        const displayName = `${baseName}${portLabel}(${wtName})`;
        const title = `[run] ${displayName}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        // PORT= 환경변수 prefix + terminalCommand, 없으면 package.json/pyproject.toml 감지 후 자동 실행
        const portPrefix = port ? `PORT=${port} ` : '';
        let runCmd = (terminalCommand as string | undefined) || '';
        const targetPort = port as number | undefined;
        if (!runCmd) {
          if (existsSync(join(workDir, 'package.json'))) {
            // Next.js: use next dev -p directly to bypass hardcoded port in package.json
            if (existsSync(join(workDir, 'next.config.ts')) || existsSync(join(workDir, 'next.config.js')) || existsSync(join(workDir, 'next.config.mjs'))) {
              runCmd = targetPort ? `./node_modules/.bin/next dev -p ${targetPort}` : 'npm run dev';
            } else {
              runCmd = 'npm run dev';
            }
          } else if (existsSync(join(workDir, 'pyproject.toml'))) runCmd = 'uv run python app.py';
          else if (existsSync(join(workDir, 'Cargo.toml'))) runCmd = 'cargo run';
        } else if (targetPort) {
          // Replace hardcoded -p NNNN in terminalCommand with target port
          runCmd = runCmd.replace(/-p\s+\d+/, `-p ${targetPort}`);
        }
        // Auto-symlink node_modules if worktree lacks it but main project has it
        const mainFolder = folderPath as string | undefined;
        const symlinkSetup = (!existsSync(join(workDir, 'node_modules')) && mainFolder && existsSync(join(mainFolder, 'node_modules')))
          ? `ln -s '${escapeSq(join(mainFolder, 'node_modules'))}' node_modules && `
          : '';
        // For ./node_modules/.bin/next, PORT prefix is embedded in -p flag — skip prefix
        const effectivePrefix = runCmd.startsWith('./node_modules/.bin/next dev') ? '' : portPrefix;
        const cmd = runCmd
          ? `cd '${escapeSq(workDir)}' && printf '\\033]0;${title}\\007' && ${symlinkSetup}${effectivePrefix}${runCmd}`
          : `cd '${escapeSq(workDir)}' && printf '\\033]0;${title}\\007'`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "워크트리 터미널 실행" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/install-app" && req.method === "POST") {
      try {
        // .cargo/config.toml의 target-dir 설정과 동일한 경로 (iCloud 밖)
        const appPath = join(process.env.HOME || "", "cargo-targets/portmanager/release/bundle/macos/포트관리기.app");
        const destPath = "/Applications/포트관리기.app";

        console.log(`[InstallApp] Installing from: ${appPath} to: ${destPath}`);

        // 기존 앱이 있으면 삭제
        if (existsSync(destPath)) {
          spawn({
            cmd: ["rm", "-rf", destPath],
            stdout: "inherit",
            stderr: "inherit",
          });
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 앱 복사
        spawn({
          cmd: ["cp", "-R", appPath, destPath],
          stdout: "inherit",
          stderr: "inherit",
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "앱이 Applications 폴더에 설치되었습니다",
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[InstallApp] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/export-dmg" && req.method === "POST") {
      try {
        console.log(`[ExportDMG] Starting...`);
        // .cargo/config.toml의 target-dir 설정과 동일한 경로 (iCloud 밖)
        const bundleDir = join(process.env.HOME || "", "cargo-targets/portmanager/release/bundle");

        // DMG 파일 찾기
        const dmgPaths = [
          join(bundleDir, "dmg"),
          join(bundleDir, "dmg 2"),
          join(bundleDir, "macos"),
        ];

        let dmgFile: string | null = null;

        for (const dmgDir of dmgPaths) {
          console.log(`[ExportDMG] Checking directory: ${dmgDir}`);
          if (existsSync(dmgDir)) {
            const { readdirSync } = await import("node:fs");
            const files = readdirSync(dmgDir);
            console.log(`[ExportDMG] Files found:`, files);

            for (const file of files) {
              if (file.endsWith('.dmg') && !file.startsWith('rw.')) {
                dmgFile = join(dmgDir, file);
                console.log(`[ExportDMG] Found DMG: ${dmgFile}`);
                break;
              }
            }
          }
          if (dmgFile) break;
        }

        if (!dmgFile) {
          console.error(`[ExportDMG] No DMG found`);
          return new Response(
            JSON.stringify({
              success: false,
              error: "DMG 파일을 찾을 수 없습니다. 먼저 빌드를 실행하세요.",
            }),
            { status: 404, headers }
          );
        }

        const home = process.env.HOME || "/Users/gwanli";
        const desktop = join(home, "Desktop");

        // 원본 파일명 추출 (버전 정보 포함)
        const { basename } = await import("node:path");
        const dmgFilename = basename(dmgFile);
        const destPath = join(desktop, dmgFilename);

        console.log(`[ExportDMG] Copying from: ${dmgFile} to: ${destPath}`);

        // 기존 파일이 있으면 삭제
        if (existsSync(destPath)) {
          const { unlinkSync } = await import("node:fs");
          unlinkSync(destPath);
        }

        // DMG 복사
        const { copyFileSync } = await import("node:fs");
        copyFileSync(dmgFile, destPath);

        console.log(`[ExportDMG] Copy successful`);

        // Desktop 폴더 열기
        spawn({
          cmd: ["open", desktop],
          stdout: "inherit",
          stderr: "inherit",
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `DMG를 Desktop에 복사했습니다`,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error(`[ExportDMG] Error:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/scan-command-files" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();
        if (!folderPath) return new Response(JSON.stringify({ files: [] }), { headers });
        const { readdirSync, existsSync } = await import("node:fs");
        if (!existsSync(folderPath)) return new Response(JSON.stringify({ files: [] }), { headers });
        const EXEC_EXTS = ['.command', '.bat', '.cmd', '.sh', '.html'];
        const files = readdirSync(folderPath)
          .filter((f: string) => EXEC_EXTS.some(ext => f.endsWith(ext)))
          .map((f: string) => `${folderPath}/${f}`);
        return new Response(JSON.stringify({ files }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ files: [], error: e.message }), { headers });
      }
    }

    if (url.pathname === "/api/open-app-data-dir" && req.method === "POST") {
      try {
        Bun.spawnSync(["open", APP_DATA_DIR]);
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/workspace-roots" && req.method === "GET") {
      const data = await loadWorkspaceRootsData();
      return new Response(JSON.stringify(data), { headers });
    }

    if (url.pathname === "/api/workspace-roots" && req.method === "POST") {
      try {
        const data = await req.json();
        await saveWorkspaceRootsData(data);
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/create-folder" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();
        if (!folderPath) {
          return new Response(JSON.stringify({ success: false, error: "Missing folderPath" }), { status: 400, headers });
        }
        if (!folderPath.startsWith('/')) {
          return new Response(JSON.stringify({ success: false, error: "절대경로가 필요합니다" }), { status: 400, headers });
        }
        const { mkdirSync, existsSync } = await import("node:fs");
        if (existsSync(folderPath)) {
          return new Response(JSON.stringify({ success: false, error: "이미 존재하는 폴더입니다" }), { status: 400, headers });
        }
        mkdirSync(folderPath, { recursive: true });
        console.log(`[CreateFolder] Created: ${folderPath}`);
        spawn({ cmd: ["open", folderPath], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, path: folderPath }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/build-windows" && req.method === "POST") {
      // 로컬 Windows 빌드 — /api/build?type=windows 와 동일한 방식
      if (buildStatus.isBuilding) {
        return new Response(JSON.stringify({ error: "빌드가 이미 진행 중입니다" }), { status: 400, headers });
      }
      // Windows 빌드 사전 요구사항 확인
      const cargoCheck = await Bun.$`cargo --version`.quiet().nothrow();
      const missing: string[] = [];
      if (cargoCheck.exitCode !== 0) missing.push('Rust (cargo)');

      if (process.platform === 'win32') {
        // MSVC cl.exe 또는 VS Build Tools 존재 확인
        const clCheck = await Bun.$`where cl.exe`.quiet().nothrow();
        const vsPaths = [
          'C:/Program Files/Microsoft Visual Studio/2022/BuildTools',
          'C:/Program Files/Microsoft Visual Studio/2022/Community',
          'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools',
          'C:/Program Files (x86)/Microsoft Visual Studio/2019/BuildTools',
        ];
        const hasVS = await Promise.all(vsPaths.map(p => Bun.file(p + '/VC/Tools/MSVC').exists()))
          .then(results => results.some(Boolean));
        if (clCheck.exitCode !== 0 && !hasVS) missing.push('Visual Studio C++ Build Tools (MSVC)');
      }

      if (missing.length > 0) {
        return new Response(JSON.stringify({
          error: `❌ Windows 빌드에 필요한 도구가 설치되지 않았습니다:\n${missing.map(m => '  • ' + m).join('\n')}\n\n👉 "자동 설치하기" 버튼으로 한 번에 설치할 수 있습니다 (약 20~40분 소요).`,
          missingTools: missing,
          canAutoInstall: process.platform === 'win32',
        }), { status: 400, headers });
      }
      buildStatus = { isBuilding: true, type: 'windows', output: [], exitCode: null };
      buildProcess = spawn({
        cmd: ["bun", "run", "tauri:build:win"],
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const readWinStream = async (stream: any) => {
        const decoder = new TextDecoder();
        for await (const chunk of stream) {
          buildStatus.output.push(decoder.decode(chunk));
        }
      };
      const wo = readWinStream(buildProcess.stdout);
      const we = readWinStream(buildProcess.stderr);
      buildProcess.exited.then(async (code: number) => {
        await Promise.all([wo, we]);
        buildStatus.exitCode = code;
        buildStatus.isBuilding = false;
      });
      return new Response(JSON.stringify({ success: true, message: 'Windows 로컬 빌드가 시작되었습니다' }), { headers });
    }

    if (url.pathname === "/api/windows-build-status" && req.method === "GET") {
      // 로컬 빌드 상태는 /api/build-status 와 동일한 buildStatus 공유
      return new Response(JSON.stringify(buildStatus), { headers });
    }

    if (url.pathname === "/api/install-windows-prereqs" && req.method === "POST") {
      if (process.platform !== 'win32') {
        return new Response(JSON.stringify({ error: "Windows에서만 지원됩니다" }), { status: 400, headers });
      }
      if (buildStatus.isBuilding) {
        return new Response(JSON.stringify({ error: "다른 작업이 진행 중입니다" }), { status: 400, headers });
      }
      buildStatus = { isBuilding: true, type: 'install-prereqs', output: [], exitCode: null };

      (async () => {
        const log = (s: string) => buildStatus.output.push(s + '\n');
        try {
          log('📦 Windows 빌드 사전 요구사항 자동 설치 시작');
          const tmpDir = 'C:/tmp';
          await Bun.$`mkdir -p ${tmpDir}`.quiet().nothrow();

          // Step 1: VS Build Tools 확인 및 설치
          const vsPaths = [
            'C:/Program Files/Microsoft Visual Studio/2022/BuildTools',
            'C:/Program Files/Microsoft Visual Studio/2022/Community',
            'C:/BuildTools',
          ];
          const hasVS = await Promise.all(vsPaths.map(p => Bun.file(p + '/VC/Tools/MSVC').exists()))
            .then(r => r.some(Boolean));

          if (!hasVS) {
            log('\n=== 1/2: Visual Studio Build Tools 설치 ===');
            log('다운로드 중... (4.5MB)');
            const vsInstaller = `${tmpDir}/vs_BuildTools.exe`;
            const dl1 = await Bun.$`curl -fsSL -o ${vsInstaller} https://aka.ms/vs/17/release/vs_BuildTools.exe`.quiet().nothrow();
            if (dl1.exitCode !== 0) throw new Error('VS Build Tools 다운로드 실패');
            log('✅ 다운로드 완료');
            log('⏳ 설치 중... (15~30분, 3~5GB 다운로드)');
            const install1 = Bun.spawn({
              cmd: [vsInstaller, '--quiet', '--wait', '--norestart', '--nocache',
                    '--installPath', 'C:/BuildTools',
                    '--add', 'Microsoft.VisualStudio.Workload.VCTools',
                    '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.22621',
                    '--includeRecommended'],
              stdout: 'pipe', stderr: 'pipe',
            });
            const readPromise = (async () => {
              const decoder = new TextDecoder();
              for await (const chunk of install1.stdout) log(decoder.decode(chunk).trim());
            })();
            const readErr = (async () => {
              const decoder = new TextDecoder();
              for await (const chunk of install1.stderr) log(decoder.decode(chunk).trim());
            })();
            const code1 = await install1.exited;
            await Promise.all([readPromise, readErr]);
            if (code1 !== 0 && code1 !== 3010) throw new Error(`VS Build Tools 설치 실패 (exit ${code1})`);
            log('✅ VS Build Tools 설치 완료');
          } else {
            log('✅ VS Build Tools 이미 설치됨 (건너뜀)');
          }

          // Step 2: Rust 확인 및 설치
          const cargoCheck = await Bun.$`cargo --version`.quiet().nothrow();
          if (cargoCheck.exitCode !== 0) {
            log('\n=== 2/2: Rust 설치 ===');
            log('다운로드 중...');
            const rustupPath = `${tmpDir}/rustup-init.exe`;
            const dl2 = await Bun.$`curl -fsSL -o ${rustupPath} https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe`.quiet().nothrow();
            if (dl2.exitCode !== 0) throw new Error('rustup 다운로드 실패');
            log('✅ 다운로드 완료');
            log('⏳ Rust 설치 중... (약 2~5분)');
            const install2 = Bun.spawn({
              cmd: [rustupPath, '-y', '--default-toolchain', 'stable', '--profile', 'default'],
              stdout: 'pipe', stderr: 'pipe',
            });
            const r1 = (async () => { const d = new TextDecoder(); for await (const c of install2.stdout) log(d.decode(c).trim()); })();
            const r2 = (async () => { const d = new TextDecoder(); for await (const c of install2.stderr) log(d.decode(c).trim()); })();
            const code2 = await install2.exited;
            await Promise.all([r1, r2]);
            if (code2 !== 0) throw new Error(`Rust 설치 실패 (exit ${code2})`);
            log('✅ Rust 설치 완료');
          } else {
            log('✅ Rust 이미 설치됨 (건너뜀)');
          }

          log('\n🎉 모든 사전 요구사항 설치 완료!');
          log('💡 앱을 재시작하거나 "Windows 빌드" 버튼을 다시 누르세요.');
          buildStatus.exitCode = 0;
        } catch (err: any) {
          log(`\n❌ 설치 실패: ${err.message}`);
          buildStatus.exitCode = 1;
        } finally {
          buildStatus.isBuilding = false;
        }
      })();

      return new Response(JSON.stringify({ success: true, message: '자동 설치 시작' }), { headers });
    }

    if (url.pathname === "/api/git-pull" && req.method === "POST") {
      try {
        const { folderPath } = await req.json() as { folderPath: string };
        if (!folderPath) return new Response(JSON.stringify({ success: false, error: "folderPath 필요" }), { headers });

        const branchProc = Bun.spawn([GIT_PATH, "rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await branchProc.exited;
        const branch = (await new Response(branchProc.stdout).text()).trim() || "main";

        const proc = Bun.spawn([GIT_PATH, "pull", "origin", branch], {
          cwd: folderPath,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const output = (stdout + stderr).trim();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ success: false, error: output }), { headers });
        }
        return new Response(JSON.stringify({ success: true, output }), { headers });
      } catch (e: any) {
        const msg = String(e);
        const err = msg.includes('ENOENT') ? `폴더 접근 불가 (Google Drive/iCloud 미동기화 가능성): ${folderPath}` : msg;
        return new Response(JSON.stringify({ success: false, error: err }), { headers });
      }
    }

    if (url.pathname === "/api/git-push" && req.method === "POST") {
      try {
        const { folderPath } = await req.json() as { folderPath: string };
        if (!folderPath) return new Response(JSON.stringify({ success: false, error: "folderPath 필요" }), { headers });

        const branchProc = Bun.spawn([GIT_PATH, "rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await branchProc.exited;
        const branch = (await new Response(branchProc.stdout).text()).trim() || "main";

        const proc = Bun.spawn([GIT_PATH, "push", "origin", branch], {
          cwd: folderPath,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const output = (stdout + stderr).trim();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ success: false, error: output }), { headers });
        }
        return new Response(JSON.stringify({ success: true, output }), { headers });
      } catch (e: any) {
        const msg = String(e);
        const err = msg.includes('ENOENT') ? `폴더 접근 불가 (Google Drive/iCloud 미동기화 가능성): ${folderPath}` : msg;
        return new Response(JSON.stringify({ success: false, error: err }), { headers });
      }
    }

    if (url.pathname === "/api/git-commit" && req.method === "POST") {
      try {
        const { worktreePath, message } = await req.json() as { worktreePath: string; message: string };
        if (!worktreePath) return new Response(JSON.stringify({ success: false, error: "worktreePath 필요" }), { headers });
        if (!message?.trim()) return new Response(JSON.stringify({ success: false, error: "커밋 메시지 필요" }), { headers });

        const addProc = Bun.spawn([GIT_PATH, "add", "-A"], { cwd: worktreePath, stdout: "pipe", stderr: "pipe" });
        await addProc.exited;

        const proc = Bun.spawn([GIT_PATH, "commit", "-m", message.trim()], { cwd: worktreePath, stdout: "pipe", stderr: "pipe" });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const output = (stdout + stderr).trim();
        if (proc.exitCode !== 0) return new Response(JSON.stringify({ success: false, error: output }), { headers });
        return new Response(JSON.stringify({ success: true, output }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: String(e) }), { headers });
      }
    }

    if (url.pathname === "/api/list-git-worktrees" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();
        if (!folderPath) {
          return new Response(JSON.stringify({ error: "folderPath required" }), { status: 400, headers });
        }
        const proc = Bun.spawn([GIT_PATH, "worktree", "list", "--porcelain"], {
          cwd: folderPath,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
        const text = await new Response(proc.stdout).text();

        // parse --porcelain output
        const worktrees: { path: string; branch?: string; is_main: boolean }[] = [];
        let currentPath: string | null = null;
        let currentBranch: string | null = null;
        let isFirst = true;

        for (const line of text.split('\n')) {
          if (line.startsWith('worktree ')) {
            if (currentPath !== null) {
              worktrees.push({ path: currentPath, branch: currentBranch ?? undefined, is_main: isFirst });
              if (isFirst) isFirst = false;
              currentBranch = null;
            }
            currentPath = line.slice('worktree '.length);
          } else if (line.startsWith('branch refs/heads/')) {
            currentBranch = line.slice('branch refs/heads/'.length);
          }
        }
        if (currentPath !== null) {
          worktrees.push({ path: currentPath, branch: currentBranch ?? undefined, is_main: isFirst });
        }

        return new Response(JSON.stringify({ success: true, worktrees }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: true, worktrees: [] }), { headers });
      }
    }

    if (url.pathname === "/api/git-worktree-add" && req.method === "POST") {
      try {
        const { folderPath, branchName, worktreePath } = await req.json();
        if (!folderPath || !branchName) {
          return new Response(JSON.stringify({ error: "folderPath and branchName required" }), { status: 400, headers });
        }
        if (!(folderPath as string).startsWith('/')) {
          return new Response(JSON.stringify({ error: "folderPath must be absolute" }), { status: 400, headers });
        }
        // Allow Unicode (Korean etc.) — only strip truly invalid git branch chars
        const safeBranch = (branchName as string).replace(/[\s~^:?*\[\\]/g, '-').replace(/\.{2,}/g, '-').replace(/^[-.]|[-.]$/g, '') || 'branch';
        // Directory name must be ASCII-only — claude -w rejects non-ASCII paths
        const dirSafeBranch = safeBranch.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]|[-.]$/g, '') || `wt${Date.now().toString(36).slice(-6)}`;
        const isICloud = (folderPath as string).includes('com~apple~CloudDocs') || (folderPath as string).includes('Mobile Documents');
        const home = process.env.HOME || `/Users/${process.env.USER}`;
        const basename = (folderPath as string).replace(/\/$/, '').split('/').pop() || 'project';
        const targetPath = worktreePath || (() => {
          if (isICloud) {
            // iCloud 경로: git checkout이 SIGBUS → ~/worktrees/ (iCloud 밖)에 생성
            return `${home}/worktrees/${basename}-${dirSafeBranch}`;
          }
          const parts = (folderPath as string).replace(/\/$/, '').split('/');
          parts[parts.length - 1] = parts[parts.length - 1] + '-' + dirSafeBranch;
          return parts.join('/');
        })();
        // Check if worktree for this branch already exists
        const listProc = Bun.spawn([GIT_PATH, "worktree", "list", "--porcelain"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await listProc.exited;
        const listOut = await new Response(listProc.stdout).text();
        const existingPath = (() => {
          const blocks = listOut.split('\n\n');
          for (const block of blocks) {
            const lines = block.trim().split('\n');
            const pathLine = lines.find(l => l.startsWith('worktree '));
            const branchLine = lines.find(l => l === `branch refs/heads/${branchName}`);
            if (pathLine && branchLine) return pathLine.replace('worktree ', '').trim();
          }
          return null;
        })();
        if (existingPath) {
          // 이미 ~/worktrees/ 안이고 ASCII 경로면 바로 반환
          const isAscii = (s: string) => /^[\x00-\x7F]*$/.test(s);
          if (existingPath.startsWith(`${home}/worktrees/`) && isAscii(existingPath)) {
            return new Response(JSON.stringify({ success: true, path: existingPath, existing: true }), { headers });
          }
          // 파일이 있으면 반환, 없으면(no-checkout 잔재) 제거 후 ~/worktrees/ 재생성
          const { readdirSync, rmSync } = await import('fs');
          let hasFiles = false;
          try { hasFiles = readdirSync(existingPath).some(e => e !== '.git'); } catch {}
          if (hasFiles && isAscii(existingPath)) {
            return new Response(JSON.stringify({ success: true, path: existingPath, existing: true }), { headers });
          }
          // 비ASCII 경로(한국어 등) → claude -w가 거부 → 제거 후 ASCII 경로로 재생성
          // 빈 워크트리 제거: .git 파일에서 메인 레포 경로 추출
          try {
            const gitContent = await Bun.file(`${existingPath}/.git`).text();
            const m = gitContent.match(/gitdir:\s*(.+)/);
            if (m) {
              const mainRepo = m[1].trim().replace(/\/\.git\/worktrees\/[^/]+$/, '');
              const rmProc = Bun.spawn([GIT_PATH, "worktree", "remove", "--force", existingPath], { cwd: mainRepo, stdout: "pipe", stderr: "pipe" });
              await rmProc.exited;
            }
          } catch {}
          try { rmSync(existingPath, { recursive: true, force: true }); } catch {}
          // fall through → ~/worktrees/ 에 새로 생성
        }
        // iCloud 경로: --no-checkout으로 add 후 target에서 checkout (SIGBUS 우회)
        const addFlags = isICloud ? ["--no-checkout"] : [];
        // Try existing branch first, then create new branch
        let proc = Bun.spawn([GIT_PATH, "worktree", "add", ...addFlags, targetPath, branchName], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        if (proc.exitCode !== 0) {
          proc = Bun.spawn([GIT_PATH, "worktree", "add", ...addFlags, "-b", branchName, targetPath], {
            cwd: folderPath, stdout: "pipe", stderr: "pipe",
          });
          await proc.exited;
        }
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ error: stderr.trim() || "git worktree add failed" }), { status: 500, headers });
        }
        // iCloud: checkout from target dir (outside iCloud) to actually populate files
        if (isICloud) {
          const coProc = Bun.spawn([GIT_PATH, "checkout"], { cwd: targetPath, stdout: "pipe", stderr: "pipe" });
          await coProc.exited;
          // non-fatal: proceed even if checkout fails
        }
        return new Response(JSON.stringify({ success: true, path: targetPath }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/git-worktree-remove" && req.method === "POST") {
      try {
        const { worktreePath } = await req.json();
        if (!worktreePath) {
          return new Response(JSON.stringify({ error: "worktreePath required" }), { status: 400, headers });
        }
        if (!(worktreePath as string).startsWith('/')) {
          return new Response(JSON.stringify({ error: "worktreePath must be absolute" }), { status: 400, headers });
        }
        if (!existsSync(worktreePath as string)) {
          return new Response(JSON.stringify({ error: `Worktree path does not exist: ${worktreePath}` }), { status: 400, headers });
        }
        // git worktree remove은 메인 레포 컨텍스트에서 실행 필요
        // worktree/.git 파일에서 메인 레포 경로 추출
        let mainRepoDir: string;
        try {
          const gitFile = await Bun.file(`${worktreePath}/.git`).text();
          // content: "gitdir: /path/to/main/.git/worktrees/name\n"
          const gitdirMatch = gitFile.match(/gitdir:\s*(.+)/);
          if (gitdirMatch) {
            // /path/to/main/.git/worktrees/name → /path/to/main
            mainRepoDir = gitdirMatch[1].trim().replace(/\/\.git\/worktrees\/[^/]+$/, '');
          } else {
            mainRepoDir = (worktreePath as string).replace(/\/[^/]+$/, '') || '/tmp';
          }
        } catch {
          mainRepoDir = (worktreePath as string).replace(/\/[^/]+$/, '') || '/tmp';
        }
        const proc = Bun.spawn([GIT_PATH, "worktree", "remove", "--force", worktreePath], {
          cwd: mainRepoDir, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ error: stderr.trim() || "git worktree remove failed" }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/git-merge-preview" && req.method === "POST") {
      try {
        const { folderPath, branchName } = await req.json();
        if (!folderPath || !branchName) return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers });
        // 진행 중인 머지가 있는지 확인 (MERGE_HEAD)
        const mergeInProgress = existsSync(`${folderPath}/.git/MERGE_HEAD`);
        if (mergeInProgress) {
          return new Response(JSON.stringify({
            error: "이미 진행 중인 머지가 있습니다.\n충돌을 해결하고 'git add' 후 커밋하거나, 'Abort Merge'로 취소하세요.",
            hasMergeInProgress: true
          }), { status: 409, headers });
        }
        // 메인 브랜치 이름 파악
        const mainProc = Bun.spawn([GIT_PATH, "rev-parse", "--abbrev-ref", "HEAD"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await mainProc.exited;
        const mainBranch = (await new Response(mainProc.stdout).text()).trim();
        // 머지될 커밋 목록
        const logProc = Bun.spawn([GIT_PATH, "log", `${mainBranch}..${branchName}`, "--oneline", "--no-decorate"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await logProc.exited;
        const commits = (await new Response(logProc.stdout).text()).trim();
        // 파일 변경 통계
        const statProc = Bun.spawn([GIT_PATH, "diff", "--stat", `${mainBranch}...${branchName}`], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await statProc.exited;
        const stat = (await new Response(statProc.stdout).text()).trim();
        // 워킹 트리 dirty 여부 (경고용, 차단 아님 — --autostash로 자동 처리됨)
        const statusProc = Bun.spawn([GIT_PATH, "status", "--porcelain"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await statusProc.exited;
        const isDirty = (await new Response(statusProc.stdout).text()).trim().length > 0;
        return new Response(JSON.stringify({ mainBranch, commits, stat, isDirty }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/git-merge-abort" && req.method === "POST") {
      try {
        const { folderPath, force } = await req.json();
        const proc = Bun.spawn([GIT_PATH, "merge", "--abort"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await proc.exited;
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          if (force) {
            // fallback: reset --merge to clean up stuck state
            const resetProc = Bun.spawn([GIT_PATH, "reset", "--merge"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
            await resetProc.exited;
            const resetStderr = await new Response(resetProc.stderr).text();
            if (resetProc.exitCode !== 0) return new Response(JSON.stringify({ error: resetStderr.trim() || stderr.trim() }), { status: 500, headers });
            return new Response(JSON.stringify({ success: true, method: "reset-merge" }), { headers });
          }
          return new Response(JSON.stringify({ error: stderr.trim() }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true, method: "merge-abort" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/git-conflicts" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();
        const proc = Bun.spawn([GIT_PATH, "diff", "--name-only", "--diff-filter=U"], { cwd: folderPath, stdout: "pipe", stderr: "pipe" });
        await proc.exited;
        const stdout = (await new Response(proc.stdout).text()).trim();
        const files = stdout ? stdout.split("\n").filter(Boolean) : [];
        return new Response(JSON.stringify({ files }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ files: [], error: error.message }), { headers });
      }
    }

    if (url.pathname === "/api/open-terminal-at-folder" && req.method === "POST") {
      try {
        const { folderPath, title: titleArg } = await req.json();
        const title = (titleArg || folderPath).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cmd = `cd '${escapeSq(folderPath as string)}' && printf '\\033]0;${title}\\007' && git status`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.3\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-git-merge" && req.method === "POST") {
      try {
        const { folderPath, branchName, name } = await req.json();
        const label = ((name || branchName) as string).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const title = `[git-merge] ${label}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cmd = `cd '${escapeSq(folderPath as string)}' && printf '\\033]0;${title}\\007' && git merge --no-ff --autostash '${escapeSq(branchName as string)}'`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/git-merge-branch" && req.method === "POST") {
      try {
        const { folderPath, branchName } = await req.json();
        if (!folderPath || !branchName) {
          return new Response(JSON.stringify({ error: "folderPath and branchName required" }), { status: 400, headers });
        }
        if (!(folderPath as string).startsWith('/')) {
          return new Response(JSON.stringify({ error: "folderPath must be absolute" }), { status: 400, headers });
        }
        // --autostash: 변경 사항 자동 스태시 후 머지, 이후 자동 팝
        const proc = Bun.spawn([GIT_PATH, "merge", "--no-ff", "--no-edit", "--autostash", branchName], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
          env: { ...process.env, GIT_EDITOR: "true", GIT_TERMINAL_PROMPT: "0" },
        });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          const msg = stderr.trim() || stdout.trim() || "git merge failed";
          const friendly = msg.includes('signal: 10') || msg.includes('SIGBUS')
            ? `iCloud 동기화로 머지 실패. Finder에서 iCloud 다운로드를 강제하거나 메인 레포를 iCloud 밖으로 이동하세요.`
            : msg.includes('CONFLICT') ? `충돌 발생: ${msg}\n→ git merge --abort 로 취소 가능`
            : msg;
          return new Response(JSON.stringify({ error: friendly }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true, output: stdout.trim() }), { headers });
      } catch (e: any) {
        const msg = String(e.message || e);
        const err = msg.includes('ENOENT')
          ? `폴더를 찾을 수 없습니다 (iCloud/Google Drive 동기화 문제?): ${folderPath}`
          : msg;
        return new Response(JSON.stringify({ error: err }), { status: 500, headers });
      }
    }

    // Portal 데이터 로드
    if (url.pathname === "/api/portal" && req.method === "GET") {
      try {
        const file = Bun.file(PORTAL_DATA_FILE);
        if (await file.exists()) {
          const data = await file.json();
          return new Response(JSON.stringify(data), { headers });
        }
        return new Response(JSON.stringify({ items: [], categories: [] }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // Portal 데이터 저장
    if (url.pathname === "/api/portal" && req.method === "POST") {
      try {
        const data = await req.json();
        if (!existsSync(APP_DATA_DIR)) {
          const { mkdirSync } = await import("node:fs");
          mkdirSync(APP_DATA_DIR, { recursive: true });
        }
        await Bun.write(PORTAL_DATA_FILE, JSON.stringify(data, null, 2));
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // AI: suggest category for a single project
    // AI: batch name + category for multiple ports in ONE claude call
    if (url.pathname === "/api/suggest-batch" && req.method === "POST") {
      try {
        const { ports: batchPorts } = await req.json() as { ports: Array<{ id: string; folderPath: string; name: string }> };
        if (!CLAUDE_PATH) {
          return new Response(JSON.stringify({ error: 'claude_not_found' }), { status: 503, headers });
        }
        if (!Array.isArray(batchPorts) || batchPorts.length === 0) {
          return new Response(JSON.stringify({ results: [] }), { headers });
        }
        const { readdirSync, readFileSync } = await import("node:fs");

        // Build project summaries for prompt
        const summaries = (batchPorts as Array<{ id: string; folderPath: string; name: string; aiName?: string }>).map((p, i) => {
          let files = '', pkg = '';
          try {
            if (existsSync(p.folderPath)) {
              files = readdirSync(p.folderPath).slice(0, 15).join(', ');
              const pkgPath = join(p.folderPath, 'package.json');
              if (existsSync(pkgPath)) pkg = readFileSync(pkgPath, 'utf-8').slice(0, 200);
            }
          } catch {}
          const displayName = p.aiName || p.name;
          return `${i + 1}. id="${p.id}" display_name="${displayName}" raw_name="${p.name}" files=[${files}]${pkg ? ` pkg=${pkg.replace(/\n/g, ' ')}` : ''}`;
        }).join('\n');

        const prompt = `Analyze these ${batchPorts.length} projects and return a JSON array ONLY (no markdown, no explanation).
IMPORTANT: derive the "name" and "category" primarily from display_name (the human-readable name), not from raw file listings.
category must be a single lowercase word that describes WHAT this project does (e.g. converter, dashboard, manager, tracker, bot, guide, calculator, automation, monitor, generator, etc.)

Return format:
[{"id":"...","name":"2-4 word English alias","category":"single lowercase word"},...]

Projects:
${summaries}`;

        const proc = Bun.spawn(
          [CLAUDE_PATH!, '-p', prompt],
          { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' }
        );
        const timeoutId = setTimeout(() => proc.kill(), 60_000);
        await proc.exited;
        clearTimeout(timeoutId);
        const raw = (await new Response(proc.stdout).text()).trim();
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) return new Response(JSON.stringify({ results: [] }), { headers });
        const parsed: Array<{ id: string; name: string; category: string }> = JSON.parse(match[0]);
        return new Response(JSON.stringify({ results: parsed }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // AI: suggest-category (legacy, kept for backward compat)
    if (url.pathname === "/api/suggest-category" && req.method === "POST") {
      const { folderPath, name } = await req.json();
      const res = await fetch(`http://localhost:${server.port}/api/suggest-name-and-category`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, name }),
      });
      const d = await res.json() as any;
      return new Response(JSON.stringify({ category: d.category ?? null }), { headers });
    }

    // AI: suggest-name (legacy, kept for backward compat)
    if (url.pathname === "/api/suggest-name" && req.method === "POST") {
      const { folderPath } = await req.json();
      const res = await fetch(`http://localhost:${server.port}/api/suggest-name-and-category`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const d = await res.json() as any;
      return new Response(JSON.stringify({ suggestions: d.name ? [d.name] : [] }), { headers });
    }

    // AI: name + category in ONE claude call (fast path)
    if (url.pathname === "/api/suggest-name-and-category" && req.method === "POST") {
      try {
        const { folderPath, name } = await req.json();
        if (!CLAUDE_PATH) {
          return new Response(JSON.stringify({ error: 'claude_not_found' }), { status: 503, headers });
        }
        if (!folderPath || !existsSync(folderPath)) {
          return new Response(JSON.stringify({ error: 'invalid_folder' }), { status: 400, headers });
        }
        const { readdirSync, readFileSync } = await import("node:fs");
        const files = readdirSync(folderPath).slice(0, 30).join(', ');
        let pkgJson = '';
        const pkgPath = join(folderPath, 'package.json');
        if (existsSync(pkgPath)) {
          try { pkgJson = readFileSync(pkgPath, 'utf-8').slice(0, 400); } catch {}
        }
        const prompt = `Project name hint: ${name || 'unknown'}
Files: ${files}
package.json excerpt: ${pkgJson}

Analyze this project and reply with JSON only (no markdown, no explanation):
{"name":"2-4 word English alias","category":"one short topic word that best describes this project (e.g. converter, dashboard, automation, chatbot, portfolio, tracker, etc.)"}`;
        const proc = Bun.spawn(
          [CLAUDE_PATH!, '-p', prompt],
          { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' }
        );
        const timeoutId = setTimeout(() => proc.kill(), 30_000);
        await proc.exited;
        clearTimeout(timeoutId);
        const raw = (await new Response(proc.stdout).text()).trim();
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return new Response(JSON.stringify({ name: null, category: null }), { headers });
        const parsed = JSON.parse(match[0]);
        return new Response(JSON.stringify({
          name: typeof parsed.name === 'string' ? parsed.name.slice(0, 60) : null,
          category: typeof parsed.category === 'string' ? parsed.category.slice(0, 30).toLowerCase() : null,
        }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // AI: generate project description from folder
    if (url.pathname === "/api/generate-description" && req.method === "POST") {
      try {
        const { folderPath, name } = await req.json();

        if (!CLAUDE_PATH) {
          return new Response(JSON.stringify({ error: 'claude_not_found' }), { status: 503, headers });
        }
        if (!folderPath || !existsSync(folderPath)) {
          return new Response(JSON.stringify({ error: 'invalid_folder' }), { status: 400, headers });
        }
        const { readdirSync, readFileSync } = await import("node:fs");
        const files = readdirSync(folderPath).slice(0, 30).join(', ');
        let pkgJson = '';
        const pkgPath = join(folderPath, 'package.json');
        if (existsSync(pkgPath)) {
          try { pkgJson = readFileSync(pkgPath, 'utf-8').slice(0, 500); } catch {}
        }
        const prompt = `Project name: ${name || 'unknown'}\nFiles: ${files}\npackage.json: ${pkgJson}\n\nWrite a one-sentence project description (max 100 chars, English). Reply with plain text only, no quotes.`;
        const proc = Bun.spawn(
          [CLAUDE_PATH!, '-p', prompt],
          { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' }
        );
        const timeoutId = setTimeout(() => proc.kill(), 30_000);
        await proc.exited;
        clearTimeout(timeoutId);
        const description = (await new Response(proc.stdout).text()).trim().slice(0, 120);
        return new Response(JSON.stringify({ description }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // ── Supabase CLI helpers ──────────────────────────────────────────────────
    if (url.pathname === "/api/supabase-cli/status" && req.method === "GET") {
      try {
        const isWin = process.platform === "win32";
        const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
        const appData = process.env.APPDATA ?? "";
        const localAppData = process.env.LOCALAPPDATA ?? "";

        // Candidate paths (macOS/Linux + Windows Scoop/winget)
        const candidatePaths = isWin ? [
          `${appData}\\scoop\\apps\\supabase\\current\\supabase.exe`,
          `${localAppData}\\Microsoft\\WinGet\\Packages\\Supabase.CLI\\supabase.exe`,
          `${home}\\.local\\bin\\supabase.exe`,
          "C:\\Program Files\\supabase\\supabase.exe",
        ] : [
          `${home}/.local/bin/supabase`,
          "/opt/homebrew/bin/supabase",
          "/usr/local/bin/supabase",
        ];
        let cliPath = "";
        for (const p of candidatePaths) {
          if (p && existsSync(p)) { cliPath = p; break; }
        }

        // PATH-resolved fallback: `where` on Windows, `which` on Unix
        if (!cliPath) {
          const whichCmd = isWin ? ["where", "supabase"] : ["which", "supabase"];
          try {
            const w = Bun.spawn(whichCmd, { stdout: "pipe", stderr: "pipe" });
            await w.exited;
            if (w.exitCode === 0) {
              const out = (await new Response(w.stdout).text()).trim();
              cliPath = out.split(/\r?\n/)[0].trim(); // first line only
            }
          } catch { /* ignore */ }
        }

        if (!cliPath) {
          const loginCmd = isWin
            ? "bun install -g supabase  # 설치 후: supabase login"
            : "brew install supabase/tap/supabase  # 설치 후: supabase login";
          return new Response(JSON.stringify({ installed: false, loginCmd }), { headers });
        }

        const extraPath = isWin
          ? `${appData}\\scoop\\shims;${process.env.PATH ?? ""}`
          : `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${home}/.local/bin:${process.env.PATH ?? ""}`;

        const proc = Bun.spawn([cliPath, "projects", "list"], {
          stdout: "pipe", stderr: "pipe",
          env: { ...process.env, PATH: extraPath },
        });
        await proc.exited;
        const out = await new Response(proc.stdout).text();
        const err = await new Response(proc.stderr).text();

        if (proc.exitCode !== 0 || /not logged in|unauthorized|login/i.test(out + err)) {
          return new Response(JSON.stringify({
            installed: true, loggedIn: false, cliPath,
            loginCmd: `${cliPath} login`,
          }), { headers });
        }

        // parse table rows: LINKED | ORG ID | REFERENCE ID | NAME | REGION | CREATED AT
        const projects = out.split("\n")
          .filter(l => l.includes("|") && !l.includes("REFERENCE ID") && !l.includes("------"))
          .map(line => {
            const parts = line.split("|").map(p => p.trim());
            return { ref: parts[2], name: parts[3], region: parts[4] };
          })
          .filter(p => p.ref && p.name);

        return new Response(JSON.stringify({ installed: true, loggedIn: true, projects, cliPath }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ installed: false, error: e.message }), { headers });
      }
    }

    if (url.pathname === "/api/supabase-cli/apikeys" && req.method === "GET") {
      const ref = url.searchParams.get("ref");
      if (!ref) return new Response(JSON.stringify({ error: "ref required" }), { status: 400, headers });
      try {
        const isWin = process.platform === "win32";
        const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
        const appData = process.env.APPDATA ?? "";
        let token = "";

        if (!isWin) {
          // macOS: try Keychain first
          try {
            const kc = Bun.spawn(["security", "find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], {
              stdout: "pipe", stderr: "pipe",
            });
            await kc.exited;
            if (kc.exitCode === 0) token = (await new Response(kc.stdout).text()).trim();
          } catch { /* not available */ }
        }

        // File-based token — macOS: ~/.supabase/access-token, Windows: %APPDATA%\supabase\access-token
        if (!token) {
          const tokenPaths = isWin
            ? [`${appData}\\supabase\\access-token`, `${home}\\.supabase\\access-token`]
            : [`${home}/.supabase/access-token`];
          for (const tp of tokenPaths) {
            if (!tp) continue;
            const f = Bun.file(tp);
            if (await f.exists()) { token = (await f.text()).trim(); break; }
          }
        }

        if (!token) {
          return new Response(JSON.stringify({ error: "no_token" }), { status: 401, headers });
        }

        // macOS Keychain base64 encoding
        if (token.startsWith("go-keyring-base64:")) {
          token = Buffer.from(token.slice("go-keyring-base64:".length), "base64").toString("utf-8").trim();
        }

        const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          return new Response(JSON.stringify({ error: "api_error", status: res.status }), { status: res.status, headers });
        }
        const keys = await res.json() as Array<{ name: string; api_key: string }>;
        const anonKey = keys.find(k => k.name === "anon")?.api_key ?? "";
        return new Response(JSON.stringify({ anonKey, projectUrl: `https://${ref}.supabase.co` }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`🚀 API Server running at http://localhost:${server.port}`);
