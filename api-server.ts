import { spawn } from "bun";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const executableProcesses = new Map<string, any>();
let buildProcess: any = null;
let buildStatus = { isBuilding: false, type: '', output: [] as string[] };

// 포트 데이터 파일 - 앱과 동일한 위치 사용
const APP_DATA_DIR = join(homedir(), "Library/Application Support/com.portmanager.portmanager");
const PORTS_DATA_FILE = join(APP_DATA_DIR, "ports.json");

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

        // .command 파일 실행 (백그라운드에서 detached 모드로)
        console.log(`[Execute] Starting process: bash ${commandPath}`);

        const proc = spawn({
          cmd: ["bash", commandPath],
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

        // 2단계: 새로운 프로세스 시작
        console.log(`[ForceRestart] Starting new process: bash ${commandPath}`);

        const newProc = spawn({
          cmd: ["bash", commandPath],
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

        buildStatus = { isBuilding: true, type, output: [] };

        const buildCommand = type === 'dmg' ? 'tauri:build:dmg' : 'tauri:build';

        console.log(`[Build] Starting ${type} build...`);

        // bash를 통해 cargo 환경을 설정하고 실행
        buildProcess = spawn({
          cmd: ["bash", "-c", `source "$HOME/.cargo/env" && cd "${import.meta.dir}" && bun run ${buildCommand}`],
          stdout: "pipe",
          stderr: "pipe",
        });

        // 출력 스트림 읽기
        (async () => {
          const decoder = new TextDecoder();
          for await (const chunk of buildProcess.stdout) {
            const text = decoder.decode(chunk);
            buildStatus.output.push(text);
            console.log(`[Build] ${text}`);
          }
        })();

        (async () => {
          const decoder = new TextDecoder();
          for await (const chunk of buildProcess.stderr) {
            const text = decoder.decode(chunk);
            buildStatus.output.push(text);
            console.error(`[Build] ${text}`);
          }
        })();

        // 프로세스 종료 대기
        buildProcess.exited.then((code: number) => {
          console.log(`[Build] Process exited with code: ${code}`);
          buildStatus.isBuilding = false;
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

    if (url.pathname === "/api/open-build-folder" && req.method === "POST") {
      try {
        const dmgFolder = join(import.meta.dir, "src-tauri/target/release/bundle/dmg");

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

    if (url.pathname === "/api/install-app" && req.method === "POST") {
      try {
        const appPath = join(import.meta.dir, "src-tauri/target/release/bundle/macos/포트관리기.app");
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
        const bundleDir = join(import.meta.dir, "src-tauri/target/release/bundle");

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

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers,
    });
  },
});

console.log(`🚀 API Server running at http://localhost:${server.port}`);
