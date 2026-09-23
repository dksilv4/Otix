#!/usr/bin/env bash
set -e

echo ""
echo "=========================================================="
echo "         OTIX DOCKER DEV RUNNER (HOT RELOAD)              "
echo "=========================================================="
echo ""

echo "[1/2] Starting all services in Docker..."
docker compose up -d

echo -n "  -> Waiting for Backend API..."
for i in {1..30}; do
    if curl -s -f http://localhost:8000/api/v1/health > /dev/null 2>&1; then
        echo " [Ready]"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "[2/2] All Services Running with Hot Reload:"
echo "  - Frontend (Vite HMR):   http://localhost:5173"
echo "  - Backend API:           http://localhost:8000"
echo "  - Storage Server:        http://localhost:8090"
echo "  - PostgreSQL:            localhost:5433"
echo "  - Redis:                 localhost:6380"
echo ""
echo "Streaming logs (frontend, api)... Press Ctrl+C to stop following logs."
echo ""

cleanup() {
    echo ""
    echo "Containers continue running in the background."
    echo "To stop them anytime, run: docker compose down"
}
trap cleanup EXIT INT TERM

docker compose logs -f frontend api
