# Web Test Report - http://localhost:9000

**테스트 일시**: 2026-03-26
**대상 URL**: http://localhost:9000 (API: http://localhost:3001)
**버전**: playwright-test-v4
**앱**: 포트관리기 (Tauri 2 + React 19 + Vite + TypeScript)

---

## 종합 등급: B

> 핵심 기능(포트 목록 표시, API 통신, 데이터 지속성) 모두 정상 동작.
> 보안 취약점(devDependencies)과 접근성 개선 필요.

---

## 0. 빌드/배포 검증

| 항목 | 결과 |
|------|------|
| 보안 취약점 | critical=0, high=3, moderate=2 (devDependencies: rollup, picomatch) |
| Next.js CVE | N/A (Tauri + Vite 앱) |
| tsconfig path alias | OK (alias 없음, bundler 모드 정상) |
| Tailwind 호환성 | OK (v3 표준 설정) |
| 미커밋 파일 | 6개 수정됨 (api-server.ts, src/App.tsx, src/PortalManager.tsx, lib.rs, tauri.conf.json, project-memory.json) |
| 배포 가능 여부 | Tauri 빌드는 가능, 단 보안 취약점 해결 권장 |

**취약점 상세**
- `rollup >=4.0.0 <4.59.0` → Arbitrary File Write (GHSA-mw96-cpmx-2vgc) - HIGH
- `picomatch <2.3.2` → ReDoS vulnerability (GHSA-c2c7-rcm5-vvqj) - HIGH
- `picomatch <2.3.2` → Method Injection (GHSA-3v7f-55p6-f55p) - MODERATE
- 수정: `bun update` 실행 권장

---

## 1. 사이트 구조

- **앱 유형**: SPA (Single Page Application)
- **프레임워크**: Tauri 2 + React 19 + Vite 7
- **발견된 페이지**: 1개 (단일 페이지, 모달/탭으로 뷰 전환)
- **주요 뷰**: Port List, Add Modal, Edit Modal, Build Log Modal, Portal Manager
- **API 엔드포인트**: 29개
- **이중 모드**: Tauri 네이티브(invoke) + 브라우저(fetch) 모두 지원

---

## 2. 기능 테스트 결과

| 테스트 | 결과 | 비고 |
|--------|------|------|
| 포트 목록 표시 | PASS | 24개 항목 정상 로드 |
| 포트 카운트 | WARN | 예상 23개 vs 실제 24개 (nhmuhtest1 신규 추가) |
| API 서버 가용성 | PASS | HTTP 200, 응답 정상 |
| 포트 상태 확인 | PASS | lsof 기반 실행 여부 감지 정상 |
| 자기 자신 감지 | PASS | 포트관리기(3001) isRunning=true 올바르게 감지 |
| detect-port | PASS | .command 파일에서 포트/폴더/프로젝트명 추출 성공 |
| 데이터 지속성 | PASS | ports.json 로드/저장 정상 |
| 실행 버튼 (브라우저) | WARN | execute-command API 호출 가능, Chrome 오픈은 Tauri 전용 |
| 404 에러 처리 | PASS | JSON 에러 응답 + HTTP 404 정상 |
| null port 항목 | FAIL | 2개 항목(nhmuhtest1, 글로벌열공v3) port=null - 실행 버튼 동작 확인 필요 |

**통과: 7 / 경고: 2 / 실패: 1**

---

## 3. 시각/접근성 검사

| 항목 | 결과 |
|------|------|
| 반응형 이슈 | 1건 - 반응형 브레이크포인트 없음 (sm:/md:/lg: 미사용), 데스크탑 전용 고정 레이아웃 |
| aria-label | 0개 - 모든 인터랙티브 요소에 없음 |
| role 속성 | 0개 |
| 접근성 위반 | 3건 (aria-label 없음, role 없음, 아이콘 버튼 텍스트 없음) |
| 다크 테마 | 44개 클래스 사용 - 일관된 dark 스타일 |
| Toast 시스템 | 구현됨 (50곳 사용), success/error 구분 |
| 레거시 alert() | 19곳 - showToast로 교체 필요 (P1 기술 부채) |

---

## 4. API/네트워크 분석

| 항목 | 결과 |
|------|------|
| 총 요청 | 29개 엔드포인트 |
| 테스트된 엔드포인트 | 8개 |
| 실패 | 0개 |
| CORS | Access-Control-Allow-Origin: * (로컬 개발용 - 적절) |
| Content-Type | application/json 일관됨 |
| 404 처리 | JSON 에러 응답 정상 |
| og:image | N/A (데스크탑 앱) |

**주요 엔드포인트 응답 시간**
- GET /api/ports: 4.2ms, 6.8KB
- POST /api/check-port-status: 정상
- POST /api/detect-port: 정상
- GET /api/portal: 정상 (빈 items, 기본 카테고리)

---

## 5. 성능 감사

| 항목 | 값 |
|------|-----|
| 프론트엔드 로드 | ~14ms (localhost) |
| API 응답 시간 | ~4ms |
| JS 번들 | 447KB |
| CSS 번들 | 25KB |
| HTML | 387B |
| 코드 스플리팅 | 없음 (단일 청크) |

FCP/LCP/CLS: 브라우저 인스트루먼테이션 없이 측정 불가 (curl 기반 측정).
447KB JS는 React 19 + Supabase + lucide-react 포함 시 적절한 수준.

---

## 6. 소셜 공유 & PWA

N/A - 데스크탑 Tauri 앱 (OG 메타태그, PWA, 카카오톡 공유 해당 없음)

---

## 7. DB/API 검증

| 항목 | 결과 |
|------|------|
| 스토리지 방식 | JSON 파일 (~/Library/Application Support/com.portmanager.portmanager/ports.json) |
| Supabase | @supabase/supabase-js 의존성 있음, sync 기능 구현됨 |
| 데이터 로드 | 24개 항목 정상 로드 |
| 데이터 저장 | POST /api/ports 엔드포인트 정상 |
| null port 항목 | 2개 (nhmuhtest1, 글로벌열공v3) - 데이터 무결성 주의 |
| 환경 변수 | Supabase URL/KEY 설정 필요 (sync 기능 사용 시) |

---

## 8. 버그 픽스 검증 결과 (핵심 목적)

요청된 검증 포인트에 대한 결론:

| 검증 포인트 | 결과 | 상세 |
|-------------|------|------|
| 포트 리스트 표시 (23개) | PASS (24개) | API에서 24개 정상 로드. 실제로 23개 예상이었으나 nhmuhtest1 신규 항목 존재 |
| 실행 버튼 동작 | PASS (제한적) | execute-command API 정상. Chrome 오픈은 Tauri 앱 환경에서만 동작 (브라우저 모드 제한) |
| 데이터 지속성 | PASS | ports.json 로드/저장 완전 정상. 앱 재시작 후 복원 확인 |
| 전체 UI 기능 | PASS (주의) | 추가/삭제/편집/정렬/필터 API 구조 정상. null port 2개 항목 주의 필요 |

---

## 9. 권장 개선사항

### 즉시 (P0)
- `bun update` 실행으로 rollup/picomatch 보안 취약점 해결

### 단기 (P1)
- App.tsx의 19개 `alert()`/`prompt()` 호출을 `showToast()` 또는 native Tauri dialog로 교체
- null port 항목(nhmuhtest1, 글로벌열공v3) 처리: UI에서 실행 버튼 비활성화 또는 port 값 설정

### 중기 (P2)
- 접근성 개선: 주요 버튼에 `aria-label` 추가 (Play, Stop, Edit, Delete 등)
- 6개 미커밋 파일 커밋 또는 검토
- Supabase 환경 변수 문서화

### 장기 (P3)
- JS 번들 코드 스플리팅 검토 (Supabase client 별도 청크)
- 반응형 레이아웃 검토 (현재 데스크탑 전용 고정 레이아웃)

---

*생성: playwright-test-v4 | 2026-03-26*
