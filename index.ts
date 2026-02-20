import index from "./index.html";
import { spawn } from "bun";

const executableProcesses = new Map<string, any>();

Bun.serve({
  port: 9000,
  routes: {
    "/": index,
    "/api/ports": {
      GET: () => {
        return new Response(JSON.stringify({ message: "Ports API" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    },
    "/api/execute-command": {
      POST: async (req) => {
        try {
          const { portId, commandPath } = await req.json();

          if (!commandPath || !portId) {
            return new Response(JSON.stringify({ error: "Missing portId or commandPath" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // .command 파일 실행
          const proc = spawn({
            cmd: ["bash", commandPath],
            stdout: "pipe",
            stderr: "pipe",
          });

          executableProcesses.set(portId, proc);

          return new Response(JSON.stringify({
            success: true,
            message: "Command started",
            portId
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    },
    "/api/stop-command": {
      POST: async (req) => {
        try {
          const { portId } = await req.json();

          if (!portId) {
            return new Response(JSON.stringify({ error: "Missing portId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          const proc = executableProcesses.get(portId);
          if (proc) {
            proc.kill();
            executableProcesses.delete(portId);
          }

          return new Response(JSON.stringify({
            success: true,
            message: "Command stopped"
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }
  },
  development: {
    hmr: true,
    console: true,
  }
});

console.log("🚀 Server running at http://localhost:9000");