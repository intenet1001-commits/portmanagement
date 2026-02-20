# 포트 관리 프로그램 🚀

로컬 개발 서버 포트를 쉽게 관리하고 실행할 수 있는 웹 애플리케이션입니다.

## 주요 기능

- ✅ 포트 번호와 프로젝트 이름 관리
- ✅ .command 파일 연동으로 서버 실행/중지
- ✅ 포트 번호 자동 감지
- ✅ 원클릭으로 브라우저에서 열기
- ✅ 데이터 자동 저장 (.ports.json)
- ✅ 정렬 기능 (이름순, 포트순, 최근순)

## 시작하기

### 1. 의존성 설치
```bash
bun install
```

### 2. 프로그램 실행

#### 방법 1: 간편 실행 (추천)
```bash
./실행.command
```
더블클릭하면 자동으로:
- API 서버 시작 (포트 3001)
- 개발 서버 시작 (포트 9000)
- Chrome 브라우저 자동 열기

#### 방법 2: 수동 실행
```bash
# 터미널 1: API 서버
bun api-server.ts

# 터미널 2: 개발 서버
bun run dev
```

그 다음 브라우저에서 http://localhost:9000 을 엽니다.

## 사용 방법

### 웹 UI에서 포트 추가
1. 프로젝트 이름 입력
2. 포트 번호 입력
3. .command 파일 경로 입력 (선택사항)
4. "추가" 버튼 클릭

### 쉬운 방법: `포트에추가.command` 사용 🎯

#### 드래그앤드롭 방식 (제일 쉬움!)
1. Finder에서 추가하고 싶은 `.command` 파일 찾기
2. **그 파일을 `포트에추가.command` 위로 드래그앤드롭!**
3. 자동으로 포트 감지 및 등록 완료!

#### 터미널 명령어 방식
```bash
# 기본 사용
bun add-command.ts /경로/실행.command

# 프로젝트 이름 지정
bun add-command.ts /경로/실행.command "내 프로젝트"
```

### 포트 관리
- **실행**: 등록된 .command 파일 실행
- **중지**: 실행 중인 프로세스 종료
- **열기**: 브라우저에서 localhost:포트 열기
- **수정**: 포트 정보 편집
- **삭제**: 포트 제거

## 기술 스택

- **런타임**: Bun
- **프론트엔드**: React + TypeScript + Vite
- **스타일링**: Tailwind CSS
- **아이콘**: Lucide React
- **백엔드**: Bun.serve() API
- **데이터 저장**: JSON 파일 (.ports.json)

## 프로젝트 구조

```
포트관리기/
├── src/
│   ├── App.tsx              # 메인 React 컴포넌트
│   ├── main.tsx            # React 진입점
│   └── index.css           # Tailwind 스타일
├── api-server.ts           # Bun API 서버
├── add-command.ts          # CLI 도구 (파일 추가)
├── 포트에추가.command       # 드래그앤드롭 헬퍼
├── 실행.command            # 간편 실행 스크립트
├── .ports.json            # 데이터 저장 (git ignored)
├── vite.config.ts          # Vite 설정
├── tailwind.config.js      # Tailwind 설정
└── package.json            # 의존성 및 스크립트
```

## API 엔드포인트

### 포트 데이터
- `GET /api/ports` - 저장된 포트 목록 조회
- `POST /api/ports` - 포트 목록 저장

### 파일 감지
- `POST /api/detect-port` - 파일에서 포트 번호 감지
  ```json
  { "filePath": "/path/to/file.command" }
  ```

### 명령어 실행
- `POST /api/execute-command` - .command 파일 실행
  ```json
  { "portId": "123", "commandPath": "/path/to/file.command" }
  ```
- `POST /api/stop-command` - 실행 중인 프로세스 중지
  ```json
  { "portId": "123" }
  ```

## 포트 번호 자동 감지

.command 파일에서 다음 패턴을 자동으로 감지합니다:
- `localhost:9000`
- `PORT=9000`
- `port=9000`

## 개발

### 개발 모드
```bash
bun run dev  # Vite 개발 서버
bun api-server.ts  # API 서버 (별도 터미널)
```

### 빌드
```bash
bun run build
```

### 미리보기
```bash
bun run preview
```

## 라이선스

Private

## 문의

문제가 발생하면 이슈를 등록해주세요.
