#!/bin/bash

# Start both development processes concurrently
echo "Starting frontend dev server on port 5180..."
npm run dev -- --port 5180 &
FRONTEND_PID=$!

echo "Starting electron dev..."
NODE_ENV=development npm run electron:dev &
ELECTRON_PID=$!

echo "Both processes started. Frontend PID: $FRONTEND_PID, Electron PID: $ELECTRON_PID"
echo "Press Ctrl+C to stop both processes"
echo "Logs from both processes will appear below:"
echo "============================================"

# Function to kill both processes on script exit
cleanup() {
    echo "Stopping processes..."
    kill $FRONTEND_PID 2>/dev/null
    kill $ELECTRON_PID 2>/dev/null
    exit
}

# Set up signal handling
trap cleanup INT TERM

# Wait for both processes
wait 