#!/usr/bin/env bun

/**
 * DMG 빌드 후처리 스크립트
 * Tauri의 DMG 번들러가 실패했을 때 임시 DMG 파일을 최종 위치로 복사합니다.
 */

import { join } from "node:path";
import { existsSync, readdirSync, copyFileSync } from "node:fs";

const PROJECT_DIR = import.meta.dir;
const MACOS_DIR = join(PROJECT_DIR, "src-tauri/target/release/bundle/macos");
const DMG_DIR = join(PROJECT_DIR, "src-tauri/target/release/bundle/dmg");

async function fixDmg() {
  try {
    console.log("[FixDMG] Checking for temporary DMG files...");

    if (!existsSync(MACOS_DIR)) {
      console.error("[FixDMG] ❌ macos bundle directory not found");
      process.exit(1);
    }

    // macos 폴더에서 rw.*.dmg 파일 찾기
    const files = readdirSync(MACOS_DIR);
    const tempDmgFiles = files.filter(f => f.startsWith("rw.") && f.endsWith(".dmg"));

    if (tempDmgFiles.length === 0) {
      console.log("[FixDMG] ℹ️  No temporary DMG files found (build might have succeeded)");
      process.exit(0);
    }

    // 가장 최근 파일 선택
    const latestTempDmg = tempDmgFiles.sort().reverse()[0];
    const tempDmgPath = join(MACOS_DIR, latestTempDmg);

    // 최종 파일명 추출 (rw.{pid}. 제거)
    const finalDmgName = latestTempDmg.replace(/^rw\.\d+\./, "");
    const finalDmgPath = join(DMG_DIR, finalDmgName);

    console.log(`[FixDMG] Found temporary DMG: ${latestTempDmg}`);
    console.log(`[FixDMG] Copying to: ${finalDmgPath}`);

    // DMG 디렉토리가 없으면 생성
    if (!existsSync(DMG_DIR)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(DMG_DIR, { recursive: true });
    }

    // 파일 복사
    copyFileSync(tempDmgPath, finalDmgPath);

    console.log(`[FixDMG] ✅ Successfully created: ${finalDmgName}`);
  } catch (error) {
    console.error("[FixDMG] ❌ Error:", error);
    process.exit(1);
  }
}

fixDmg();
