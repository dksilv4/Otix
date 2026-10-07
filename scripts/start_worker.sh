#!/usr/bin/env bash
# Otix Compute Worker Persistent Background Runner (macOS / Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_SCRIPT="$REPO_ROOT/backend/scripts/admin_worker.py"
PID_FILE="$REPO_ROOT/.worker.pid"
LOG_FILE="$REPO_ROOT/worker.log"
VENV_DIR="$REPO_ROOT/.venv-worker"

# Configuration
SERVER="${SERVER:-http://84.8.154.67:8000}"
USERNAME="${USERNAME:-worker}"
PASSWORD="${PASSWORD:-worker}"
TASK="${TASK:-embeddings}"
BATCH_SIZE="${BATCH_SIZE:-100}"
GPU_BATCH_SIZE="${GPU_BATCH_SIZE:-32}"
MODEL_NAME="${MODEL_NAME:-BAAI/bge-m3}"

# Detect Python interpreter with PyTorch
if [ -x "$VENV_DIR/bin/python" ]; then
    PYTHON_EXEC="$VENV_DIR/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON_EXEC="$(command -v python3)"
else
    echo "Error: Python not found. Please install Python 3.12+ or create .venv-worker"
    exit 1
fi

status() {
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"
        if kill -0 "$PID" 2>/dev/null; then
            CHILD_PID=$(pgrep -P "$PID" python 2>/dev/null || true)
            echo "Worker is RUNNING (Supervisor PID: $PID, Worker Python PID: ${CHILD_PID:-active})"
            echo "  Server:   $SERVER"
            echo "  Task:     $TASK"
            echo "  Model:    $MODEL_NAME"
            echo "  Logs:     $LOG_FILE"
            return 0
        else
            echo "Worker PID file exists ($PID), but process is NOT running."
            rm -f "$PID_FILE"
            return 1
        fi
    else
        echo "Worker is NOT running."
        return 1
    fi
}

start() {
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"
        if kill -0 "$PID" 2>/dev/null; then
            echo "Worker is already running (PID: $PID)."
            return 0
        else
            rm -f "$PID_FILE"
        fi
    fi

    echo "=========================================================="
    echo "   STARTING OTIX WORKER IN THE BACKGROUND (PERSISTENT)    "
    echo "=========================================================="
    echo "  Server:         $SERVER"
    echo "  Task:           $TASK"
    echo "  Model:          $MODEL_NAME"
    echo "  Batch Size:     $BATCH_SIZE"
    echo "  GPU Batch Size: $GPU_BATCH_SIZE"
    echo "  Python:         $PYTHON_EXEC"
    echo "  Log File:       $LOG_FILE"
    echo "=========================================================="

    export PYTHONUNBUFFERED=1
    nohup bash -c '
        while true; do
            "'"$PYTHON_EXEC"'" -u "'"$WORKER_SCRIPT"'" \
                --server "'"$SERVER"'" \
                --username "'"$USERNAME"'" \
                --password "'"$PASSWORD"'" \
                --task "'"$TASK"'" \
                --batch-size "'"$BATCH_SIZE"'" \
                --gpu-batch-size "'"$GPU_BATCH_SIZE"'" \
                --model "'"$MODEL_NAME"'" \
                >> "'"$LOG_FILE"'" 2>&1
            EXIT_CODE=$?
            if [ "$EXIT_CODE" -eq 143 ] || [ "$EXIT_CODE" -eq 130 ]; then
                break
            fi
            echo "[$(date)] [!] Worker exited with code $EXIT_CODE. Supervisor auto-restarting in 5s..." >> "'"$LOG_FILE"'"
            sleep 5
        done
    ' >/dev/null 2>&1 &

    PID=$!
    disown "$PID" 2>/dev/null || true
    echo "$PID" > "$PID_FILE"

    echo "Worker supervisor launched (PID: $PID). Auto-restart enabled."
    echo "Run './start_worker.sh logs' to follow live output."
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"
        echo "Stopping worker (Supervisor PID: $PID)..."
        # First kill child processes (python worker)
        pkill -P "$PID" 2>/dev/null || true
        kill "$PID" 2>/dev/null || true
        for i in {1..10}; do
            if ! kill -0 "$PID" 2>/dev/null; then
                echo "Worker stopped."
                rm -f "$PID_FILE"
                return 0
            fi
            sleep 1
        done
        echo "Worker did not terminate gracefully, sending SIGKILL..."
        pkill -9 -P "$PID" 2>/dev/null || true
        kill -9 "$PID" 2>/dev/null || true
        rm -f "$PID_FILE"
        echo "Worker terminated."
    else
        echo "Worker is not running."
    fi
}

logs() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE"
    fi
    tail -f "$LOG_FILE"
}

case "${1:-start}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 1
        start
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
