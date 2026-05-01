#!/usr/bin/env bun

import { join } from "node:path";

const TAURI_CONF_PATH = join(import.meta.dir, "src-tauri/tauri.conf.json");
const BUILD_NUMBER_PATH = join(import.meta.dir, "build-number.json");

async function updateVersion() {
  try {
    // 빌드 번호 읽기 → 증가
    const bnFile = Bun.file(BUILD_NUMBER_PATH);
    const { buildNumber } = await bnFile.json() as { buildNumber: number };
    const next = buildNumber + 1;

    // build-number.json 갱신
    await Bun.write(BUILD_NUMBER_PATH, JSON.stringify({ buildNumber: next }, null, 2) + '\n');

    // tauri.conf.json 업데이트
    const confFile = Bun.file(TAURI_CONF_PATH);
    const config = await confFile.json() as Record<string, unknown>;
    const old = config.version;
    config.version = `${next}.0.0`;
    config.productName = 'CS_Manager';
    await Bun.write(TAURI_CONF_PATH, JSON.stringify(config, null, 2) + '\n');

    console.log(`[UpdateVersion] ✅ ${old} → v${next} (${next}.0.0)`);

    // 아이콘에 버전 번호 스탬프
    const stampScript = join(import.meta.dir, "stamp-icon.py");
    const stamp = Bun.spawn(["python3", stampScript], { stdout: "inherit", stderr: "inherit" });
    const exitCode = await stamp.exited;
    if (exitCode !== 0) {
      console.warn(`[UpdateVersion] ⚠️ 아이콘 스탬프 실패 (빌드는 계속)`);
    }
  } catch (error) {
    console.error(`[UpdateVersion] ❌ 에러:`, error);
    process.exit(1);
  }
}

updateVersion();
