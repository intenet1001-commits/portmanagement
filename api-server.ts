import { spawn } from "bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** Escape single quotes for use inside single-quoted shell strings: ' → '\'' */
const escapeSq = (s: string): string => s.replace(/'/g, "'\\''");

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

// 포트 데이터 로드
async function loadPortsData() {
  try {
    const file = Bun.file(PORTS_DATA_FILE);
    if (await file.exists()) {
      return await file.json();
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
          try {
            Bun.spawnSync(['open', '-a', 'Google Chrome', commandPath]);
          } catch {
            Bun.spawnSync(['open', commandPath]); // fallback to default browser
          }
          return new Response(JSON.stringify({ success: true, message: 'Opened HTML in browser' }), { headers });
        }

        // 파일 경로 vs raw 커맨드 판별
        const isFilePath = commandPath.startsWith('/') || commandPath.startsWith('~');
        const cmd = isFilePath ? ["bash", commandPath] : ["bash", "-c", commandPath];
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
            const lsofProc = spawn({
              cmd: ["lsof", "-ti", `:${port}`],
              stdout: "pipe",
              stderr: "pipe",
            });

            await lsofProc.exited;
            const output = await new Response(lsofProc.stdout).text();
            const pids = output.trim().split('\n').filter(p => p.length > 0);

            if (pids.length > 0) {
              console.log(`[Stop] Found ${pids.length} PIDs on port ${port}:`, pids);

              // 모든 PID에 대해 SIGTERM 시도 후 SIGKILL
              for (const pid of pids) {
                console.log(`[Stop] Killing PID ${pid} on port ${port}`);

                // SIGTERM 시도
                const termProc = spawn({
                  cmd: ["kill", "-15", pid],
                  stdout: "inherit",
                  stderr: "inherit"
                });
                await termProc.exited;

                // 200ms 대기
                await new Promise(resolve => setTimeout(resolve, 200));

                // 프로세스가 아직 살아있는지 확인
                const checkProc = spawn({
                  cmd: ["kill", "-0", pid],
                  stdout: "pipe",
                  stderr: "pipe",
                });
                await checkProc.exited;

                if (checkProc.exitCode === 0) {
                  // 여전히 살아있으면 SIGKILL
                  console.log(`[Stop] Process ${pid} still alive, sending SIGKILL`);
                  spawn({ cmd: ["kill", "-9", pid], stdout: "inherit", stderr: "inherit" });
                  await new Promise(resolve => setTimeout(resolve, 100));
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

        // lsof로 포트를 사용하는 모든 프로세스 강제 종료
        try {
          const lsofProc = spawn({
            cmd: ["lsof", "-ti", `:${port}`],
            stdout: "pipe",
            stderr: "pipe",
          });

          await lsofProc.exited;
          const output = await new Response(lsofProc.stdout).text();
          const pids = output.trim().split('\n').filter(p => p.length > 0);

          if (pids.length > 0) {
            console.log(`[ForceRestart] Found PIDs on port ${port}:`, pids);

            // 모든 PID를 SIGKILL로 즉시 강제 종료
            for (const pid of pids) {
              console.log(`[ForceRestart] Force killing PID ${pid}`);
              spawn({ cmd: ["kill", "-9", pid], stdout: "inherit", stderr: "inherit" });
            }

            // 프로세스가 완전히 종료될 시간 대기
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`[ForceRestart] Successfully killed all processes on port ${port}`);
          } else {
            console.log(`[ForceRestart] No process found on port ${port}`);
          }
        } catch (e) {
          console.error(`[ForceRestart] Error finding/killing process by port:`, e);
        }

        // 2단계: 새로운 프로세스 시작 (파일 경로 vs raw 커맨드 판별)
        const isFilePath = commandPath.startsWith('/') || commandPath.startsWith('~');
        const restartCmd = isFilePath ? ["bash", commandPath] : ["bash", "-c", commandPath];
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

        // lsof로 포트 상태 확인
        const lsofProc = spawn({
          cmd: ["lsof", "-ti", `:${port}`],
          stdout: "pipe",
          stderr: "pipe",
        });

        await lsofProc.exited;
        const output = await new Response(lsofProc.stdout).text();
        const pids = output.trim().split('\n').filter(p => p.length > 0);

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

    if (url.pathname === "/api/pick-folder" && req.method === "GET") {
      try {
        const proc = Bun.spawn({
          cmd: ["osascript", "-e", 'POSIX path of (choose folder)'],
          stdout: "pipe",
          stderr: "pipe",
        });
        const picked = (await new Response(proc.stdout).text()).trim();
        await proc.exited;
        if (proc.exitCode !== 0 || !picked) {
          return new Response(JSON.stringify({ error: "cancelled" }), { status: 400, headers });
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

        // 절대 경로 확인
        if (!folderPath.startsWith("/")) {
          return new Response(
            JSON.stringify({ error: `절대 경로가 필요합니다: "${folderPath}"` }),
            { status: 400, headers }
          );
        }

        // 경로 존재 여부 확인 (파일/디렉토리 모두 지원)
        if (!existsSync(folderPath)) {
          return new Response(
            JSON.stringify({ error: `폴더를 찾을 수 없습니다: "${folderPath}"` }),
            { status: 404, headers }
          );
        }

        // macOS에서 폴더 열기
        spawn({
          cmd: ["open", folderPath],
          stdout: "inherit",
          stderr: "inherit",
        });

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

    if (url.pathname === "/api/open-tmux-claude" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();

        const escSession = escapeSq(sessionName);
        const escFolder = folderPath ? escapeSq(folderPath) : null;
        const escapedSessionName = sessionName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const title = `[tmux] ${escapedSessionName}`;
        const claudeCmd = worktreePath ? `claude -w '${escapeSq(worktreePath)}'` : 'claude';
        const cmd = escFolder
          ? `cd '${escFolder}' && printf '\\033]0;[tmux] ${escSession}\\007'; tmux new-session -A -s '${escSession}' '${claudeCmd}'`
          : `printf '\\033]0;[tmux] ${escSession}\\007'; tmux new-session -A -s '${escSession}' '${claudeCmd}'`;

        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });

        return new Response(
          JSON.stringify({ success: true, message: `tmux + Claude 실행 중 (세션: ${sessionName})` }),
          { headers }
        );
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-tmux-claude-fresh" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();
        const escSession = escapeSq(sessionName);
        const escFolder = folderPath ? escapeSq(folderPath) : null;
        const escapedSessionName = sessionName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const title = `[tmux-fresh] ${escapedSessionName}`;
        const claudeCmd = worktreePath ? `claude -w '${escapeSq(worktreePath)}'` : 'claude';
        const killCmd = `tmux kill-session -t '${escSession}' 2>/dev/null || true`;
        const newCmd = escFolder
          ? `cd '${escFolder}' && printf '\\033]0;[tmux-fresh] ${escSession}\\007'; tmux new-session -s '${escSession}' '${claudeCmd}'`
          : `printf '\\033]0;[tmux-fresh] ${escSession}\\007'; tmux new-session -s '${escSession}' '${claudeCmd}'`;
        const cmd = `${killCmd}; ${newCmd}`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(
          JSON.stringify({ success: true, message: `tmux 새 세션 시작 (세션: ${sessionName})` }),
          { headers }
        );
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-tmux-claude-bypass" && req.method === "POST") {
      try {
        const { sessionName, folderPath, worktreePath } = await req.json();

        const escSession = escapeSq(sessionName);
        const escFolder = folderPath ? escapeSq(folderPath) : null;
        const escapedSessionName = sessionName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const title = `[tmux-bypass] ${escapedSessionName}`;
        const claudeCmd = worktreePath
          ? `claude --dangerously-skip-permissions -w '${escapeSq(worktreePath)}'`
          : 'claude --dangerously-skip-permissions';
        const cmd = escFolder
          ? `cd '${escFolder}' && printf '\\033]0;[tmux-bypass] ${escSession}\\007'; tmux new-session -A -s '${escSession}-bypass' '${claudeCmd}'`
          : `printf '\\033]0;[tmux-bypass] ${escSession}\\007'; tmux new-session -A -s '${escSession}-bypass' '${claudeCmd}'`;

        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${title}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });

        return new Response(
          JSON.stringify({ success: true, message: `tmux + Claude (bypass) 실행 중 (세션: ${sessionName}-bypass)` }),
          { headers }
        );
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-claude" && req.method === "POST") {
      try {
        const { folderPath, name, worktreePath } = await req.json();
        const escapedName = (name || 'Claude').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const claudeCmd = worktreePath ? `claude -w '${escapeSq(worktreePath)}'` : 'claude';
        const cmd = folderPath
          ? `cd '${escapeSq(folderPath)}' && printf '\\033]0;${escapedName}\\007' && ${claudeCmd}`
          : `printf '\\033]0;${escapedName}\\007' && ${claudeCmd}`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${escapedName}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "Terminal에서 Claude 실행" }), { headers });
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/open-terminal-claude-bypass" && req.method === "POST") {
      try {
        const { folderPath, name, worktreePath } = await req.json();
        const escapedName = `[bypass] ${(name || 'Claude').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}`;
        const claudeCmd = worktreePath
          ? `claude --dangerously-skip-permissions -w '${escapeSq(worktreePath)}'`
          : 'claude --dangerously-skip-permissions';
        const cmd = folderPath
          ? `cd '${escapeSq(folderPath)}' && printf '\\033]0;${escapedName}\\007' && ${claudeCmd}`
          : `printf '\\033]0;${escapedName}\\007' && ${claudeCmd}`;
        const escapedCmd = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `tell application "iTerm"\n  activate\n  set newWindow to create window with default profile\n  tell current session of newWindow\n    write text "${escapedCmd}"\n    delay 0.5\n    set name to "${escapedName}"\n  end tell\nend tell`;
        spawn({ cmd: ["osascript", "-e", script], stdout: "inherit", stderr: "inherit" });
        return new Response(JSON.stringify({ success: true, message: "Terminal에서 Claude (bypass) 실행" }), { headers });
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
      try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          return new Response(
            JSON.stringify({ error: "GITHUB_TOKEN 환경변수가 설정되지 않았습니다.\n실행 방법: GITHUB_TOKEN=ghp_xxx bun api-server.ts" }),
            { status: 400, headers }
          );
        }

        const ghResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({ ref: 'main' }),
          }
        );

        if (!ghResponse.ok) {
          const errorText = await ghResponse.text();
          return new Response(
            JSON.stringify({ error: `GitHub API 오류: ${ghResponse.status} ${errorText}` }),
            { status: 500, headers }
          );
        }

        console.log('[BuildWindows] GitHub Actions workflow triggered');
        return new Response(
          JSON.stringify({ triggered: true, message: 'GitHub Actions Windows 빌드가 시작되었습니다' }),
          { headers }
        );
      } catch (error: any) {
        console.error('[BuildWindows] Error:', error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers }
        );
      }
    }

    if (url.pathname === "/api/windows-build-status" && req.method === "GET") {
      try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          return new Response(
            JSON.stringify({ status: 'error', message: 'GITHUB_TOKEN not set' }),
            { headers }
          );
        }

        const ghResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?workflow_id=${GITHUB_WORKFLOW}&per_page=1&branch=main`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          }
        );

        if (!ghResponse.ok) {
          return new Response(
            JSON.stringify({ status: 'error', message: `GitHub API error: ${ghResponse.status}` }),
            { headers }
          );
        }

        const data = await ghResponse.json();
        const runs = data.workflow_runs;

        if (!runs || runs.length === 0) {
          return new Response(
            JSON.stringify({ status: 'queued', runId: null, runUrl: null, conclusion: null, artifactsUrl: null }),
            { headers }
          );
        }

        const run = runs[0];
        return new Response(
          JSON.stringify({
            status: run.status,         // queued | in_progress | completed
            conclusion: run.conclusion, // success | failure | cancelled | null
            runId: run.id,
            runUrl: run.html_url,
            artifactsUrl: run.status === 'completed' && run.conclusion === 'success'
              ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${run.id}`
              : null,
          }),
          { headers }
        );
      } catch (error: any) {
        console.error('[WindowsBuildStatus] Error:', error);
        return new Response(
          JSON.stringify({ status: 'error', message: error.message }),
          { headers }
        );
      }
    }

    if (url.pathname === "/api/list-git-worktrees" && req.method === "POST") {
      try {
        const { folderPath } = await req.json();
        const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
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

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`🚀 API Server running at http://localhost:${server.port}`);
