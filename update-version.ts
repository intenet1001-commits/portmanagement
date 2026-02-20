#!/usr/bin/env bun

/**
 * 빌드 전 버전 업데이트 스크립트
 * 현재 날짜를 기반으로 tauri.conf.json의 버전을 업데이트합니다.
 * 형식: YYYY.MM.DD (예: 2025.12.10)
 */

import { join } from "node:path";

const TAURI_CONF_PATH = join(import.meta.dir, "src-tauri/tauri.conf.json");

async function updateVersion() {
  try {
    // 마지막 git 커밋 날짜를 버전으로 사용 (fallback: 오늘 날짜)
    let newVersion: string;
    try {
      const result = await Bun.$`git log -1 --format=%cd --date=format:%Y.%m.%d`.text();
      // semver는 숫자 앞 0 불허 → "2026.02.20" → "2026.2.20"
      newVersion = result.trim().split('.').map(Number).join('.');
      console.log(`[UpdateVersion] 최종 커밋 날짜 사용: ${newVersion}`);
    } catch {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const d = now.getDate();
      newVersion = `${y}.${m}.${d}`;
      console.log(`[UpdateVersion] fallback - 오늘 날짜 사용: ${newVersion}`);
    }
    const newProductName = `포트관리기`;

    console.log(`[UpdateVersion] 새 버전: ${newVersion}`);

    // tauri.conf.json 읽기
    const file = Bun.file(TAURI_CONF_PATH);
    const content = await file.text();
    const config = JSON.parse(content);

    // 이전 버전 저장
    const oldVersion = config.version;
    const oldProductName = config.productName;
    console.log(`[UpdateVersion] 이전 버전: ${oldVersion}`);
    console.log(`[UpdateVersion] 이전 제품명: ${oldProductName}`);

    // 버전 및 제품명 업데이트
    config.version = newVersion;
    config.productName = newProductName;

    // 파일 저장
    await Bun.write(TAURI_CONF_PATH, JSON.stringify(config, null, 2) + '\n');

    console.log(`[UpdateVersion] ✅ 버전이 업데이트되었습니다: ${oldVersion} → ${newVersion}`);
    console.log(`[UpdateVersion] ✅ 제품명이 업데이트되었습니다: ${oldProductName} → ${newProductName}`);
  } catch (error) {
    console.error(`[UpdateVersion] ❌ 에러:`, error);
    process.exit(1);
  }
}

updateVersion();
