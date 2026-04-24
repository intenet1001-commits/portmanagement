#!/usr/bin/env bun

/**
 * DMG 빌드 후처리 스크립트
 * Tauri의 DMG 번들러가 실패했을 때 임시 DMG 파일을 최종 위치로 복사합니다.
 */

import { join } from "node:path";
import { existsSync, readdirSync, copyFileSync, mkdirSync, statSync } from "node:fs";

const PROJECT_DIR = import.meta.dir;
// .cargo/config.toml의 target-dir 설정과 동일한 경로 (iCloud 밖)
const CARGO_TARGET_DIR = join(process.env.HOME || "", "cargo-targets/portmanager");
const MACOS_DIR = join(CARGO_TARGET_DIR, "release/bundle/macos");
const DMG_DIR = join(CARGO_TARGET_DIR, "release/bundle/dmg");
// CARGO_TARGET_DIR 미설정 시 fallback (기본 src-tauri/target)
const FALLBACK_DMG_DIR = join(PROJECT_DIR, "src-tauri/target/release/bundle/dmg");

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function fixDmg() {
  try {
    console.log("[FixDMG] Checking for temporary DMG files...");

    // 1) temp DMG 처리 (CARGO_TARGET_DIR 경로)
    if (existsSync(MACOS_DIR)) {
      const files = readdirSync(MACOS_DIR);
      const tempDmgFiles = files.filter(f => f.startsWith("rw.") && f.endsWith(".dmg"));

      if (tempDmgFiles.length > 0) {
        const latestTempDmg = tempDmgFiles.sort().reverse()[0];
        const tempDmgPath = join(MACOS_DIR, latestTempDmg);
        const finalDmgName = latestTempDmg.replace(/^rw\.\d+\./, "");
        const finalDmgPath = join(DMG_DIR, finalDmgName);
        console.log(`[FixDMG] Found temporary DMG: ${latestTempDmg}`);
        console.log(`[FixDMG] Copying to: ${finalDmgPath}`);
        ensureDir(DMG_DIR);
        copyFileSync(tempDmgPath, finalDmgPath);
        console.log(`[FixDMG] ✅ Successfully created: ${finalDmgName}`);
        return;
      }
    }

    // 2) fallback: src-tauri/target/ 경로에서 최신 DMG 찾아 cargo-targets로 복사
    if (existsSync(FALLBACK_DMG_DIR)) {
      const fallbackFiles = readdirSync(FALLBACK_DMG_DIR).filter(f => f.endsWith(".dmg") && !f.startsWith("rw."));
      if (fallbackFiles.length > 0) {
        const latest = fallbackFiles
          .map(f => ({ name: f, mtime: statSync(join(FALLBACK_DMG_DIR, f)).mtime.getTime() }))
          .sort((a, b) => b.mtime - a.mtime)[0].name;
        const dest = join(DMG_DIR, latest);
        if (!existsSync(dest)) {
          const src = join(FALLBACK_DMG_DIR, latest);
          ensureDir(DMG_DIR);
          console.log(`[FixDMG] Copying from fallback path: ${latest}`);
          copyFileSync(src, dest);
          console.log(`[FixDMG] ✅ Successfully created: ${latest}`);
        } else {
          console.log(`[FixDMG] ✅ DMG already in target dir: ${latest}`);
        }
        return;
      }
    }

    console.log("[FixDMG] ℹ️  No DMG files found anywhere.");
  } catch (error) {
    console.error("[FixDMG] ❌ Error:", error);
    process.exit(1);
  }
}

fixDmg();
