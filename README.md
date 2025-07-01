# personal cluely

## Features

- **Ask Mode**: Analyze what's on your screen and get intelligent responses
- **Listen Mode**: Advanced meeting assistant with system audio capture
- **Queue System**: Manage and review AI interactions
- **Real-time Processing**: Instant AI responses to screen content and audio

## how to use

made this for myself so only works for mac (blackhole)
clone repo, npm install

1. **Install BlackHole**:
   ```bash
   brew install blackhole-2ch
   ```

2. **Setup Multi-Output Device**:
   - Open **Audio MIDI Setup** (found in Applications > Utilities)
   - Click the **+** button and select **Create Multi-Output Device**
   - Check both **Built-in Output** and **BlackHole 2ch**
   - Make sure **Built-in Output** is the master device (clock source)
   - Name it "Meeting Output"

3. **Configure System Audio**:
   - Go to **System Preferences > Sound > Output**
   - Select your "Meeting Output" device
   - This routes system audio through both your speakers AND BlackHole

run dev.sh file and profit

## Development

```bash
# Install dependencies
npm install

# Start development
./dev.sh
```

## License

Licensed under the Apache License, Version 2.0 - see LICENSE file for details.

## Attribution

This project is based on original work by Prathit (https://github.com/Prat011) and has been modified for this personal project just on my computer

**Original Work by Prathit:**
- Core Electron application architecture
- LLM integration foundation with Google Gemini
- Screenshot capture and processing system
- React UI framework and basic components
- IPC communication infrastructure

**Changes**
- Complete audio capture and transcription system using Deepgram
- Meeting assistant functionality with real-time audio processing
- System audio integration for Mac using BlackHole
- Interactive screenshot chat with conversation history
- Enhanced AI prompting system for better responses
- Conversational audio processing with context awareness
- Advanced debugging and development tools