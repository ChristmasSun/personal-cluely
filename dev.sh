#!/bin/bash

# Auto-switch to meeting audio mode for development
echo "🎧 Switching to meeting audio mode..."
if ./scripts/toggle-audio.sh meeting; then
    echo "✅ Meeting audio mode activated!"
else
    echo "⚠️  Could not switch to meeting mode, continuing anyway..."
fi

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
    
    echo "🎧 Switching back to normal audio mode..."
    if ./scripts/toggle-audio.sh normal; then
        echo "✅ Normal audio mode restored!"
    else
        echo "⚠️  Could not switch back to normal mode"
    fi
    
    exit
}

# Set up signal handling
trap cleanup INT TERM

# Wait for both processes
wait 