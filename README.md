# personal cluely

## Features

- **Ask Mode**: Analyze what's on your screen and get intelligent responses
- **Listen Mode**: Advanced meeting assistant with system audio capture (unfortunately this lowkey slow rn maybe cuz api keys used in .env r free gemini and free deepgram idk)
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
  
make .env file 
put in free gemini dev key and deepgram key (they give u $200 free credit) 
unless u have better paid api keys in which case put in those and then rename all references to above keys in proj 
i just didnt want to spend money tbh 

run dev.sh file and profit (runs an apple script that auto changes ur audio devices for blackhole but might error depending on ur names so check scripts/ folder if so

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
