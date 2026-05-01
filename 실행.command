#!/bin/bash

# 현재 스크립트 디렉토리로 이동
cd "$(dirname "$0")"

echo "포트 관리 프로그램을 시작합니다..."
echo ""
echo "종료하려면 Ctrl+C를 누르세요."
echo ""

# 기존 프로세스 정리 (포트 충돌 방지)
cleanup_existing() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "포트 $port 기존 프로세스 정리 중... (PID: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
    fi
}

cleanup_existing 3001
cleanup_existing 9000

# API 서버 실행 (bun --watch 없이 안정적 실행)
echo "API 서버를 시작하는 중 (포트 3001)..."
bun api-server.ts &
API_PID=$!
echo "API 서버 PID: $API_PID"

# Vite 개발 서버 실행 (npx로 로컬 vite 실행)
echo "Vite 개발 서버를 시작하는 중 (포트 9000)..."
./node_modules/.bin/vite &
VITE_PID=$!
echo "Vite 서버 PID: $VITE_PID"

# 서버가 시작될 때까지 대기
sleep 3

# 서버 상태 확인
check_server() {
    local port=$1
    local name=$2
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "✓ $name 서버 실행 중 (포트 $port)"
    else
        echo "✗ $name 서버 시작 실패 (포트 $port)"
    fi
}

check_server 3001 "API"
check_server 9000 "Vite"
echo ""

# 크롬 브라우저로 자동으로 열기
echo "Chrome 브라우저를 여는 중..."
open -a "Google Chrome" http://localhost:9000

# 종료 시그널 핸들러
cleanup() {
    echo ""
    echo "서버를 종료하는 중..."
    kill $API_PID $VITE_PID 2>/dev/null
    # 포트 기반 정리 (자식 프로세스 포함)
    lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null
    lsof -ti:9000 2>/dev/null | xargs kill -9 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# 서버 프로세스가 종료될 때까지 대기
wait
