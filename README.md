# 포트 관리 프로그램

로컬 개발 서버의 포트와 프로젝트를 관리하는 **Tauri + React 앱**입니다.  
웹 브라우저(http://localhost:9000)로도 동작합니다.

---

## 빠른 시작 — 처음 설치하는 경우

> 이미 설치된 경우: [기존 기기 → 새 기기 이전](#새-기기에-이전) 참고

### Step 1. 사전 준비

#### Bun 설치 (JavaScript 런타임)

**macOS / Linux**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows** (PowerShell 관리자 권한)
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

설치 확인:
```bash
bun --version
```

#### Git 설치

**macOS**: `brew install git` 또는 Xcode Command Line Tools (`xcode-select --install`)

**Windows**:
```powershell
winget install Git.Git
```
> 설치 후 새 PowerShell 창을 열어야 `git` 명령이 인식됩니다.

#### Claude Code 설치 (AI 기능 사용 시)

```bash
npm install -g @anthropic-ai/claude-code
claude
```

> Claude Code 없이도 포트 관리 기능은 모두 사용 가능합니다.

---

### Step 2. 저장소 받기

```bash
git clone https://github.com/intenet1001-commits/portmanagement.git
cd portmanagement
bun install
```

---

### Step 3. 실행

```bash
bun run start
```

API 서버(포트 3001) + 개발 서버(포트 9000) 동시 시작.  
브라우저에서 **http://localhost:9000** 을 엽니다.

**macOS 간편 실행 (더블클릭)**
```
실행.command   ← Finder에서 더블클릭
```

**Windows 간편 실행 (더블클릭)**
```
start.bat   ← 탐색기에서 더블클릭
```
또는 PowerShell에서:
```powershell
cd portmanagement
bun run start
```

> ⚠️ Windows에서 `bun run start` 실행 시 방화벽 허용 팝업이 뜨면 **허용** 선택하세요.  
> 브라우저에서 **http://localhost:9000** 을 엽니다.

---

### Step 4. DB 구축 (Supabase — 여러 기기 동기화 시)

앱을 실행하면 **초기 설정 마법사**가 자동으로 열립니다.

```
🚀 세팅 버튼 클릭 → 처음 사용 선택 → 단계별 안내 따라가기
```

마법사가 다음을 자동으로 처리합니다:
- Supabase 계정 생성 안내
- CLI 설치 + 로그인 (브라우저 인증)
- 프로젝트 생성
- 테이블 자동 생성 (SQL 마이그레이션)
- API Key 자동 입력 (CLI 인증 시 원클릭)
- 연결 테스트

> ✅ Supabase CLI가 이미 설치·로그인된 경우: 마법사에서 **"CLI 자동 가져오기"** 버튼으로 URL + Anon Key 한번에 입력됩니다.

#### Windows 전용 — Supabase CLI 사전 설치

마법사의 CLI 설치 단계에서 **Scoop** 패키지 매니저가 필요합니다.  
마법사 실행 전 PowerShell (관리자 권한)에서 미리 설치하세요:

```powershell
# 1. Scoop 설치
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex

# 2. 새 PowerShell 창을 열고 Supabase CLI 설치
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 3. 설치 확인
supabase --version
```

Scoop 없이 직접 설치하는 방법:
```powershell
# PowerShell 관리자 권한
irm https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.zip -OutFile supabase.zip
Expand-Archive supabase.zip -DestinationPath supabase-cli
Move-Item supabase-cli\supabase.exe C:\Windows\System32\
```

> ⚠️ Scoop 또는 CLI 설치 후 반드시 **새 터미널 창**을 열어야 명령이 인식됩니다.

---

## 새 기기에 이전

기존 기기에서 이미 사용 중이라면:

```bash
git clone https://github.com/intenet1001-commits/portmanagement.git
cd portmanagement
bun install
bun run start
```

앱 실행 후:
```
🚀 세팅 버튼 → 추가 단말 등록 → URL & Key 입력 (또는 CLI 자동 가져오기) → 이 기기 이름 입력
```

그 다음 **Pull 버튼**으로 기존 기기의 포트 목록을 가져옵니다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 포트 실행/중지 | .command 파일 연동, 강제 재실행 (SIGKILL) |
| 실시간 상태 감지 | `lsof` 기반 포트 상태 확인 |
| 다기기 동기화 | Supabase Push/Pull — 기기별 독립 ID |
| 다른 기기 데이터 가져오기 | 설정 → 고급 설정 → 단말 조회 → 선택 → Pull |
| AI 추천 이름 | Claude Code로 한국어 프로젝트명에 영어 별칭 자동 생성 |
| 포털 탭 | 자주 쓰는 링크·폴더 카테고리 관리 |
| 검색 | Cmd+F — 이름, AI 별칭, URL, 경로 통합 |
| 정렬·필터 | 이름순/포트순/최근순, 포트 있음/없음 |

---

## 다기기 동기화 사용법

### Push (이 기기 → Supabase)

프로젝트 관리 탭 → **Push 버튼**

### Pull (Supabase → 이 기기)

- **내 기기 데이터**: Pull 버튼
- **다른 기기 데이터**: ⚙ 설정 → 고급 설정 → 단말 조회 → 기기 선택 → 저장 → Pull

> 다른 기기 Pull 시 경로(folderPath)는 자동으로 빈 상태로 가져옵니다.  
> Pull 완료 후 경로 설정 모달이 자동으로 열립니다.

---

## 포트 추가 방법

### UI에서 직접 추가
프로젝트 이름 + 포트 번호 입력 후 "추가" 클릭

### 드래그앤드롭
Finder에서 `.command` 파일을 `포트에추가.command` 위로 드래그

### CLI
```bash
bun add-command.ts /경로/실행.command "프로젝트 이름"
```

---

## 빌드

### macOS 배포

```bash
bun run tauri:build      # .app 번들
bun run tauri:build:dmg  # DMG 배포 패키지
```

> 빌드 버전은 마지막 git 커밋 날짜 기준으로 자동 생성됩니다.

### Windows 배포

**사전 준비:**
```powershell
# Rust 설치 (https://rustup.rs)
winget install Rustlang.Rustup

# Visual Studio C++ Build Tools 설치
winget install Microsoft.VisualStudio.2022.BuildTools

# WebView2 런타임 (Windows 11은 기본 내장)
# Windows 10: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

**빌드:**
```powershell
bun run tauri:build:windows   # .msi + .exe 설치 패키지
```

빌드 결과물:
```
src-tauri\target\release\bundle\msi\포트관리기_x.x.x_x64_en-US.msi
src-tauri\target\release\bundle\nsis\포트관리기_x.x.x_x64-setup.exe
```

> ⚠️ Windows 빌드는 Windows 환경에서 직접 실행해야 합니다 (크로스 컴파일 미지원).

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 런타임 | Bun |
| 프론트엔드 | React 19 + TypeScript + Vite |
| 데스크탑 | Tauri 2 (Rust) |
| 스타일링 | Tailwind CSS |
| API 서버 | Bun.serve() (포트 3001) |
| DB 동기화 | Supabase |

---

## 데이터 저장 위치

**macOS**
```
~/Library/Application Support/com.portmanager.portmanager/ports.json
~/Library/Application Support/com.portmanager.portmanager/logs/{portId}.log
```

**Windows**
```
%APPDATA%\com.portmanager.portmanager\ports.json
%APPDATA%\com.portmanager.portmanager\logs\{portId}.log
```
탐색기 주소창에 `%APPDATA%\com.portmanager.portmanager` 입력으로 바로 이동 가능.

---

## Windows 사용 시 주의사항

| 항목 | macOS | Windows |
|---|---|---|
| 간편 실행 | `실행.command` 더블클릭 | `start.bat` 더블클릭 |
| 포트 상태 감지 | `lsof` 기반 | `netstat` 기반 (자동 처리) |
| 프로세스 강제 종료 | `SIGKILL` | `taskkill /F` (자동 처리) |
| `.command` 파일 | ✅ 지원 | ❌ `.bat` 또는 `.ps1` 파일 사용 |
| iTerm 연동 (카테고리 최신화 등) | ✅ | ❌ Windows Terminal 미지원 |
| Tauri 앱 빌드 | `.app` / `.dmg` | `.msi` / `.exe` |
| 데이터 경로 | `~/Library/...` | `%APPDATA%\...` |

> 💡 **Windows에서 실행 파일 등록**: UI에서 포트 추가 시 `.command` 대신 `.bat` 또는 `.ps1` 파일을 등록하세요.

---

© 2025 CS & Company. All rights reserved.
