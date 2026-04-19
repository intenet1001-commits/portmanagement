/**
 * Windows 빌드 래퍼 — CARGO_TARGET_DIR을 %USERPROFILE%\cargo-targets\portmanager 로 고정.
 *
 * 이유: 프로젝트가 C:\Windows\System32\ 하위 경로에 있을 때, makensis.exe가
 * System32 아래 파일 읽기를 Windows OS 레벨에서 차단당함(os error 2/5).
 * target dir을 System32 밖으로 빼서 NSIS 번들링이 성공하도록 함.
 */
import { $ } from "bun";
import { homedir } from "os";
import { join } from "path";

const targetDir = join(homedir(), "cargo-targets", "portmanager");
process.env.CARGO_TARGET_DIR = targetDir;

console.log(`[build-win] CARGO_TARGET_DIR=${targetDir}`);

await $`bun update-version.ts`;
await $`bun run build`;
await $`tauri build --bundles nsis`;

console.log(`\n✅ 빌드 완료: ${join(targetDir, "release", "bundle", "nsis")}\\*.exe`);
