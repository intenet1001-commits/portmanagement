#!/bin/bash

# 현재 스크립트 디렉토리로 이동
cd "$(dirname "$0")"

echo "포트 관리 프로그램을 시작합니다..."
echo ""
echo "종료하려면 Ctrl+C를 누르세요."
echo ""

# 백그라운드에서 API 서버 실행
echo "API 서버를 시작하는 중..."
bun api-server.ts &
API_PID=$!

# 백그라운드에서 Vite 개발 서버 실행
echo "개발 서버를 시작하는 중..."
bun run dev &
VITE_PID=$!

# 서버가 시작될 때까지 대기
sleep 3

# 크롬 브라우저로 자동으로 열기
echo "Chrome 브라우저를 여는 중..."
open -a "Google Chrome" http://localhost:9000

# 종료 시그널 핸들러
cleanup() {
    echo ""
    echo "서버를 종료하는 중..."
    kill $API_PID $VITE_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# 서버 프로세스가 종료될 때까지 대기
wait
