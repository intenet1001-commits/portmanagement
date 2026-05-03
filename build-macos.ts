#!/usr/bin/env bun

/**
 * macOS 빌드 래퍼 — CARGO_TARGET_DIR을 $HOME/cargo-targets/portmanager 로 동적 설정.
 *
 * 이유:
 * 1. .cargo/config.toml에 절대경로를 하드코딩하면 다른 맥에서 빌드 실패
 * 2. iCloud Drive (Documents/) 안에 프로젝트가 있으면 ETIMEDOUT 에러 발생
 * 3. $HOME을 동적으로 읽어서 모든 맥에서 동일하게 동작
 *
 * 사용법:
 *   bun build-macos.ts [--dmg]
 *   bun build-macos.ts --dmg  → DMG 번들만 빌드
 *   bun build-macos.ts        → 전체 빌드 (.app + DMG)
 */

import { $ } from "bun";
import { homedir } from "os";
import { join } from "path";

const targetDir = join(homedir(), "cargo-targets", "portmanager");
process.env.CARGO_TARGET_DIR = targetDir;

const isDmg = process.argv.includes("--dmg");

console.log(`[build-macos] CARGO_TARGET_DIR=${targetDir}`);
console.log(`[build-macos] Build type: ${isDmg ? "DMG only" : "full (.app + DMG)"}`);

// 1. 버전 업데이트
await $`bun update-version.ts`;

// 업데이트된 버전 번호 읽기
const { buildNumber: newVersion } = await Bun.file("build-number.json").json() as { buildNumber: number };

// 2. Frontend 빌드
await $`bun run build`;

// 3. Tauri 빌드 (CARGO_TARGET_DIR 환경변수가 자동으로 상속됨)
if (isDmg) {
  const result = await $`tauri build --bundles dmg`.nothrow();
  // DMG 후처리 (실패해도 fix-dmg 실행)
  await $`bun fix-dmg.ts`;
  if (result.exitCode !== 0) {
    console.error(`[build-macos] tauri build failed with code ${result.exitCode}`);
    process.exit(result.exitCode);
  }
} else {
  await $`tauri build`;
}

// 4. 버전 파일 git commit (push는 수동)
const gitAdd = await $`git add build-number.json src-tauri/tauri.conf.json src-tauri/icons/`.nothrow();
if (gitAdd.exitCode === 0) {
  const gitCommit = await $`git commit -m "chore: bump to v${newVersion}"`.nothrow();
  if (gitCommit.exitCode === 0) {
    console.log(`\n📦 버전 v${newVersion} commit 완료 — git push로 GitHub에 반영하세요`);
  } else {
    // 변경사항 없으면 commit 불필요 (이미 커밋된 상태)
    console.log(`\n📦 버전 파일 변경 없음 (이미 commit됨)`);
  }
} else {
  console.warn(`\n⚠️ git add 실패 — 수동으로 커밋하세요`);
}

console.log(`\n✅ macOS 빌드 완료`);
console.log(`   .app: ${join(targetDir, "release", "bundle", "macos")}`);
if (isDmg) {
  console.log(`   .dmg: ${join(targetDir, "release", "bundle", "dmg")}`);
}
