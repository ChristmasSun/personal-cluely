#!/bin/bash

# Toggle Audio Devices for Free Cluely
# Usage: ./scripts/toggle-audio.sh [meeting|normal]
# If no argument provided, it auto-toggles based on current state

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLESCRIPT_PATH="$SCRIPT_DIR/toggle-audio.applescript"

# Check if AppleScript exists
if [ ! -f "$APPLESCRIPT_PATH" ]; then
    echo "❌ Error: AppleScript not found at $APPLESCRIPT_PATH"
    exit 1
fi

# Run the AppleScript with the provided argument (if any)
if [ $# -eq 0 ]; then
    echo "🔄 Auto-toggling audio devices..."
    osascript "$APPLESCRIPT_PATH"
else
    echo "🔄 Switching audio to $1 mode..."
    osascript "$APPLESCRIPT_PATH" "$1"
fi

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ Audio device switching completed successfully"
else
    echo "❌ Error occurred during audio device switching"
    exit 1
fi 