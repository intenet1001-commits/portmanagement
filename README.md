# 포트 관리 프로그램

로컬 개발 서버의 포트와 .command 파일을 관리하는 **Tauri + React 데스크탑 앱**입니다.  
웹 브라우저(http://localhost:9000)로도 동작합니다.

## 주요 기능

- ✅ 포트 번호, 프로젝트 이름, .command 파일 연동으로 서버 실행/중지
- ✅ 실시간 포트 상태 감지 (`lsof` 기반)
- ✅ 강제 재실행 (SIGKILL → 재실행), 개선된 중지 로직
- ✅ 원클릭으로 Chrome에서 열기 / Finder에서 폴더 열기
- ✅ 실시간 로그 보기 (Terminal `tail -f`)
- ✅ 정렬 (이름순, 포트순, 최근순) + 필터 (전체, 포트있음, 포트없음)
- ✅ 검색 (Cmd+F) — 이름, AI 별칭, URL, 경로 통합 검색
- ✅ **AI 추천 이름** — Claude Code로 한국어/암호화된 이름에 영어 별칭 자동 부여 ✨
- ✅ **Supabase 동기화** — 여러 맥에서 포트 목록 공유 (Push/Pull)
- ✅ 포털 탭 — 자주 쓰는 링크·폴더를 카테고리별로 관리
- ✅ Toast 알림, 내보내기/불러오기 (JSON)

## 시작하기

### 의존성 설치
```bash
bun install
```

### 실행

#### 방법 1: 간편 실행 (추천)
```bash
bun run start
```
API 서버(포트 3001) + 개발 서버(포트 9000) 동시 시작.  
그 다음 브라우저에서 http://localhost:9000 을 엽니다.

#### 방법 2: Tauri 데스크탑 앱
```bash
bun run tauri:dev
```

#### 방법 3: 수동 실행
```bash
# 터미널 1: API 서버
bun api-server.ts

# 터미널 2: 개발 서버
bun run dev
```

## 데이터 저장 위치

웹 모드와 Tauri 앱 모드가 같은 파일을 공유합니다.

```
~/Library/Application Support/com.portmanager.portmanager/ports.json
~/Library/Application Support/com.portmanager.portmanager/logs/{portId}.log
```

## AI 추천 이름 (검색 별칭)

한국어/암호 같은 프로젝트 이름이 많을 때, AI가 영어 별칭을 자동 생성해 에메랄드 배지로 표시합니다.  
검색창(Cmd+F)에서 영어 별칭으로도 매칭됩니다.

### 사용법
1. 툴바의 **"AI 이름" 버튼** 클릭 → 클립보드에 Claude Code 프롬프트 복사
2. Claude Code 세션에 붙여넣기 → `aiName` 없는 항목에 별칭 자동 생성
3. 포트관리기에서 **"새로고침"** 클릭 → 에메랄드 배지로 표시

| 원본 이름 | AI 별칭 |
|---|---|
| 진도표 | `progress chart` |
| 링크페이지생성기 | `link page generator` |
| auth converter3 | `oauth mcp manager` |

## Supabase 동기화

설정 모달(톱니바퀴 아이콘)에서 Supabase URL + anon key 입력 후 Push/Pull 사용.

| 테이블 | 용도 |
|---|---|
| `ports` | 포트/프로젝트 목록 |
| `workspace_roots` | 워크스페이스 루트 경로 |
| `portal_items` | 포털 링크·폴더 항목 |
| `portal_categories` | 포털 카테고리 |

> `aiName`은 device-local 필드 — Supabase로 동기화되지 않으며 Pull 시에도 보존됩니다.

## 포트 추가 방법

### 웹 UI에서 직접 추가
프로젝트 이름·포트 번호·.command 파일 경로 입력 후 "추가" 버튼 클릭.

### 드래그앤드롭 (`포트에추가.command`)
Finder에서 `.command` 파일을 `포트에추가.command` 위로 드래그 → 자동 등록.

### CLI
```bash
bun add-command.ts /경로/실행.command "프로젝트 이름"
```

## 빌드 (macOS 배포)

```bash
# 버전 업데이트 (마지막 git 커밋 날짜 기준)
bun run update-version

# .app 번들 빌드
bun run tauri:build

# DMG 빌드 (배포용)
bun run tauri:build:dmg
```

> ⚠️ 빌드 결과물은 iCloud Drive 밖(`~/cargo-targets/portmanager/`)에 생성됩니다.

```
~/cargo-targets/portmanager/release/bundle/macos/포트관리기.app
~/cargo-targets/portmanager/release/bundle/dmg/포트관리기_YYYY.M.D_aarch64.dmg
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 런타임 | Bun |
| 프론트엔드 | React 19 + TypeScript + Vite |
| 데스크탑 | Tauri 2 (Rust 백엔드) |
| 스타일링 | Tailwind CSS |
| 아이콘 | Lucide React |
| API 서버 | Bun.serve() (포트 3001) |
| DB 동기화 | Supabase |

## 프로젝트 구조

```
portmanagement/
├── src/
│   ├── App.tsx              # 메인 React 컴포넌트
│   ├── main.tsx             # React 진입점
│   └── index.css            # Tailwind 스타일
├── src-tauri/
│   ├── src/lib.rs           # Tauri 커맨드 (Rust)
│   ├── tauri.conf.json      # Tauri 설정
│   └── capabilities/        # ACL 권한 설정
├── api-server.ts            # Bun API 서버 (웹 모드용)
├── add-command.ts           # CLI 도구
├── update-version.ts        # 빌드 버전 자동 업데이트
├── 포트에추가.command        # 드래그앤드롭 헬퍼
└── 실행.command             # 간편 실행 스크립트
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/ports` | 포트 목록 조회 |
| POST | `/api/ports` | 포트 목록 저장 |
| POST | `/api/detect-port` | .command 파일에서 포트 자동 감지 |
| POST | `/api/execute-command` | .command 파일 실행 |
| POST | `/api/stop-command` | 프로세스 중지 |
| POST | `/api/force-restart-command` | 강제 재실행 (SIGKILL) |
| POST | `/api/check-port-status` | 포트 실행 상태 확인 |
| POST | `/api/build` | Tauri 앱 빌드 (type: app\|dmg) |
| GET | `/api/build-status` | 빌드 로그 폴링 |
| GET | `/api/portal` | portal.json 로드 |
| POST | `/api/portal` | portal.json 저장 |
| GET | `/api/pick-folder` | 폴더 선택 다이얼로그 (웹 모드) |

## 라이선스

© 2025 CS & Company. All rights reserved.
