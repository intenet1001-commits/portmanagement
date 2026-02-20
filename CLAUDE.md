---
description: 포트 관리 프로그램 - 로컬 개발 서버 포트 관리 도구
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: true
---

# 포트 관리 프로그램

로컬 개발 서버의 포트와 .command 파일을 관리하는 Tauri + React 앱입니다.

## 프로젝트 구조

- `src/App.tsx` - 메인 React 컴포넌트
- `api-server.ts` - Bun 기반 API 서버 (포트 3001)
- `src-tauri/` - Tauri 백엔드 (Rust)
- `포트에추가.command` - .command 파일 추가 헬퍼
- `add-command.ts` - CLI 도구

**데이터 저장 위치** (웹과 앱이 공유):
- macOS: `~/Library/Application Support/com.portmanager.portmanager/ports.json`
- 로그: `~/Library/Application Support/com.portmanager.portmanager/logs/{portId}.log`

## 기술 스택

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

## 주요 기능

### 포트 관리
- 포트 번호, 프로젝트 이름, .command 파일 경로, 폴더 경로 관리
- .command 파일 실행/중지/강제재실행 (포트 번호 기반 프로세스 관리)
- **실시간 포트 상태 감지**: `lsof` 명령으로 실제 실행 여부 확인
- **강제 재실행**: 정지가 안 되는 프로세스를 SIGKILL로 강제 종료 후 재실행
- **개선된 중지 로직**: 모든 PID 검색 및 종료, SIGTERM → SIGKILL 자동 전환
- **Chrome에서 열기**: Tauri 앱에서 자동으로 Chrome 브라우저 실행
- 프로젝트 폴더 Finder에서 열기
- 포트 정보 내보내기/불러오기 (JSON)
- **실시간 로그 보기**: Terminal에서 `tail -f`로 프로세스 출력 확인

### 자동화
- .command 파일에서 포트 번호 자동 감지 (`localhost:포트` 또는 `PORT=포트` 패턴)
- .command 파일 경로에서 폴더 경로 자동 추출
- 드래그 앤 드롭으로 .command 파일 추가 (포트에추가.command 사용)
- **포트 데이터 자동 로드**: 앱 재시작 시 저장된 포트 목록 자동 복원

### UI/UX
- **모던 디자인**: 미국 테크 스타일의 세련된 인터페이스
  - 다크 테마 (#0a0a0b 배경, #18181b 카드)
  - 향상된 가독성 (white/zinc 색상으로 명확한 대비)
  - 컴팩트하고 효율적인 레이아웃 (작은 폰트, 타이트한 간격)
  - 미묘한 호버 효과와 투명도 기반 색상 시스템
- **Toast 알림 시스템**: 서버 실행/중지 시 플로팅 배너 표시
  - 우측 상단에서 슬라이드 인 애니메이션
  - 성공/실패에 따른 색상 구분 (초록/빨강)
  - 3초 후 자동 제거 또는 수동 닫기 가능
  - Non-blocking UI로 사용자 작업 방해 없음
- **최적화된 창 크기**: MacBook 14인치 기준 세로 최대화 (1000x1050)

### Tauri 빌드 & 배포
- **앱 빌드**: .app 번들 생성 (Applications 폴더 설치용)
- **DMG 빌드**: 완전 자동화된 macOS 배포 패키지 생성
- **자동 버전 관리**: 빌드 시 날짜 기반 버전 자동 업데이트 (YYYY.MM.DD 형식)
  - 예: `포트관리기_2025.12.10_aarch64.dmg`
  - `bun run tauri:build` 또는 `bun run tauri:build:dmg` 실행 시 자동 적용
  - 수동 업데이트: `bun run update-version`
  - **DMG 빌드 후처리**: macOS 버전 호환성 문제 시 자동으로 임시 DMG를 최종 위치로 복사
- **실시간 빌드 로그**:
  - 빌드 진행 상황을 실시간으로 확인할 수 있는 모달 창
  - 색상 코딩 (성공: 초록, 에러: 빨강, 경고: 노랑)
  - 1초마다 자동 폴링으로 로그 업데이트
  - 로그 복사 기능 (클립보드)
  - 빌드 완료/실패 자동 감지
- **DMG 출시하기**: 빌드된 DMG를 Desktop으로 자동 복사
- Bundle identifier: `com.portmanager.portmanager`
- 창 크기: 1000x1050 (최소: 800x700)
- **데이터 저장 위치**:
  - macOS: `~/Library/Application Support/com.portmanager.portmanager/ports.json`
  - 로그: `~/Library/Application Support/com.portmanager.portmanager/logs/{portId}.log`
- **다른 맥으로 이전**:
  - 방법 1: "내보내기"/"불러오기" 버튼 사용 (권장)
  - 방법 2: `ports.json` 파일 수동 복사
  - DMG 파일만으로 새 맥에 설치 가능 (데이터는 별도 이전 필요)

## 개발 명령어

```bash
# 개발 서버 시작 (Vite)
bun run dev

# API 서버 시작
bun api-server.ts

# 둘 다 시작
bun run start

# Tauri 개발 모드
bun run tauri:dev

# 버전 업데이트 (수동)
bun run update-version

# 프로덕션 빌드 (.app) - 버전 자동 업데이트됨
bun run tauri:build

# DMG 빌드 (배포용) - 버전 자동 업데이트됨
bun run tauri:build:dmg

# 빌드 결과물 위치
# .app: src-tauri/target/release/bundle/macos/포트관리기.app
# DMG: src-tauri/target/release/bundle/dmg/포트관리기_2025.12.10_aarch64.dmg

# 앱 내에서 "DMG 출시하기" 버튼으로 Desktop에 자동 복사 가능
```

## API 엔드포인트

- `GET /api/ports` - 포트 목록 조회
- `POST /api/ports` - 포트 목록 저장
- `POST /api/detect-port` - .command 파일 분석 (포트, 폴더 경로 추출)
- `POST /api/execute-command` - .command 파일 실행 (로그 파일로 출력 리다이렉트)
- `POST /api/stop-command` - 실행 중인 명령 중지 (포트의 모든 PID 검색 및 종료)
- `POST /api/force-restart-command` - 강제 재실행 (SIGKILL로 모든 프로세스 종료 후 재실행)
- `POST /api/check-port-status` - 포트 실행 상태 확인 (`lsof` 사용)
- `POST /api/build` - Tauri 앱 빌드 (type: 'app' | 'dmg')
- `GET /api/build-status` - 빌드 상태 및 로그 확인 (실시간 폴링용)
- `POST /api/open-build-folder` - 빌드 폴더 열기
- `POST /api/open-folder` - 지정된 폴더 열기
- `POST /api/export-dmg` - DMG 파일을 Desktop으로 복사

## 데이터 구조

```typescript
// Frontend (TypeScript)
interface PortInfo {
  id: string;
  name: string;
  port: number;
  commandPath?: string;  // .command 파일 경로
  folderPath?: string;   // 프로젝트 폴더 경로 (자동 추출)
  isRunning?: boolean;   // 서버 실행 상태
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';  // 토스트 알림 타입
}
```

```rust
// Backend (Rust)
#[derive(Debug, Serialize, Deserialize, Clone)]
struct PortInfo {
    id: String,
    name: String,
    port: u16,
    #[serde(rename = "commandPath")]
    command_path: Option<String>,
    #[serde(rename = "folderPath")]
    folder_path: Option<String>,
    #[serde(rename = "isRunning")]
    is_running: bool,
}
```

## Tauri 커맨드 (Rust 백엔드)

- `load_ports()` - 포트 데이터 로드 (Tauri app data dir)
- `save_ports(ports)` - 포트 데이터 저장
- `execute_command(port_id, command_path, app_handle)` - .command 파일 실행 (로그 리다이렉트)
- `stop_command(port_id, port, state)` - 실행 중인 프로세스 중지 (모든 PID 검색 및 SIGTERM → SIGKILL)
- `force_restart_command(port_id, port, command_path, state, app_handle)` - 강제 재실행 (SIGKILL → 500ms 대기 → 재실행)
- `detect_port(file_path)` - 포트 번호 자동 감지
- `check_port_status(port)` - 포트 실행 상태 확인 (lsof 사용)
- `open_log(port_id, app_handle)` - Terminal에서 로그 파일 열기 (tail -f)
- `open_build_folder()` - DMG 빌드 폴더 열기
- `open_folder(folder_path)` - 지정된 폴더 열기
- `open_in_chrome(url)` - Chrome 브라우저에서 URL 열기
- `import_ports_from_file(file_path)` - JSON 파일에서 포트 불러오기
- `install_app_to_applications()` - .app을 Applications 폴더에 설치
- `export_dmg()` - DMG 파일을 Desktop으로 복사
- `build_app(build_type, app_handle)` - Tauri 앱 빌드 (백그라운드)

## 프로세스 관리 시스템

### 실행 상태 추적
- **HashMap 기반**: 앱에서 직접 실행한 프로세스는 `HashMap<String, u32>` (portId → PID)에 저장
- **lsof 기반**: 앱 재시작 후 기존 프로세스는 `lsof -ti:포트번호`로 PID 검색
- **상태 확인**: "새로고침" 버튼으로 모든 포트의 실제 실행 여부를 확인

### 중지 로직 (개선됨)
- **모든 PID 검색**: `lsof -ti :포트`로 포트를 사용하는 모든 프로세스 찾기
- **각 PID마다**:
  1. SIGTERM(-15) 전송
  2. 200ms 대기
  3. `kill -0` 명령으로 프로세스 생존 확인
  4. 살아있으면 SIGKILL(-9)로 강제 종료
- **HashMap 정리**: 내부 추적 맵에서도 제거
- **안전한 에러 처리**: 프로세스가 없어도 정상적으로 처리

### 강제 재실행 로직
- **1단계 - 강제 종료**:
  - 포트의 모든 PID를 SIGKILL(-9)로 즉시 종료
  - HashMap에서 제거
  - 500ms 대기 (프로세스 완전 종료 시간)
- **2단계 - 재실행**:
  - .command 파일 존재 확인
  - 새 프로세스 실행 (로그 파일로 리다이렉트)
  - 새 PID를 HashMap에 등록
- **사용 시나리오**:
  - 정지가 안 되는 프로세스 강제 종료
  - 빠른 재시작 (중지 + 실행을 한 번에)
  - 좀비 프로세스 처리

### 로그 시스템
- **로그 파일 위치**: `~/Library/Application Support/com.portmanager.portmanager/logs/{portId}.log`
- **자동 리다이렉트**: 프로세스 실행 시 stdout/stderr를 로그 파일로 자동 저장
- **실시간 보기**: Terminal에서 `tail -f` 명령으로 실시간 로그 확인
- **사용 방법**: "로그" 버튼 클릭 → Terminal 창 자동 열림

### 에러 처리
- **중지 실패 시**: 프로세스가 없어도 에러 대신 "already stopped" 메시지 표시
- **Chrome 열기 실패 시**: Toast 알림으로 에러 표시
- **로그 파일 없음**: 자동으로 빈 로그 파일 생성
- **파일 없음**: .command 파일이 없으면 명확한 에러 메시지 표시

## 빌드 시스템

### 실시간 빌드 로그 모달
- **UI 컴포넌트**: 풀스크린 모달 (App.tsx:743-815)
  - 헤더: 빌드 타입 표시 (App/DMG), 진행 상태 아이콘
  - 로그 영역: 스크롤 가능한 터미널 스타일 로그
  - 푸터: 로그 라인 수 표시, 로그 복사 버튼
- **색상 코딩**:
  - ✅ (초록): 성공 메시지
  - ❌ (빨강): 에러 메시지
  - ⚠️ (노랑): 경고 메시지
  - 일반 텍스트 (회색): 기본 로그
- **실시간 업데이트**:
  - 1초마다 `/api/build-status` 폴링
  - 중복 로그 자동 필터링
  - 빌드 완료 시 자동 감지 및 폴링 중지
  - 10분 타임아웃 보호

### 빌드 프로세스
- **앱 빌드 (handleBuildApp)**:
  - `bun run tauri:build` 실행
  - .app 번들 생성
  - Applications 폴더 설치 가능
- **DMG 빌드 (handleBuildDmg)**:
  - `bun run tauri:build:dmg` 실행
  - 배포용 DMG 파일 생성
  - Desktop으로 자동 복사 가능
- **백그라운드 실행**: 빌드는 별도 프로세스에서 실행되어 UI 블로킹 없음
- **로그 수집**: stdout/stderr를 실시간으로 캡처하여 Frontend에 전달

### 사용 방법
1. "앱 빌드" 또는 "DMG 빌드" 버튼 클릭
2. 자동으로 빌드 로그 모달 열림
3. 실시간으로 빌드 진행 상황 확인
4. 완료 후 모달 닫기 또는 로그 복사
5. 에러 발생 시 빨간색 메시지로 즉시 확인 가능

## 저작권

© 2025 CS & Company. All rights reserved.
