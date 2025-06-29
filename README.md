# Free Cluely - AI Meeting Assistant

An AI-powered screen analysis and meeting assistant tool built with Electron, React, and modern web technologies.

## Features

- **Ask Mode**: Analyze what's on your screen and get intelligent responses
- **Listen Mode**: Advanced meeting assistant with system audio capture
- **Queue System**: Manage and review AI interactions
- **Real-time Processing**: Instant AI responses to screen content and audio

## Meeting Assistant Setup (Mac)

For the best meeting experience, you'll want to capture both your microphone AND system audio (to hear other meeting participants). This requires a virtual audio device.

### Option 1: BlackHole (Recommended for Mac)

BlackHole is a professional-grade virtual audio loopback driver used by audio professionals.

1. **Install BlackHole**:
   ```bash
   brew install blackhole-2ch
   ```
   
   Or download from: https://github.com/ExistentialAudio/BlackHole

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

4. **Start Meeting Assistant**:
   - Click "Listen" in Free Cluely
   - The app will automatically detect BlackHole and capture system audio
   - You'll see "System + Mic" status when working properly

### Option 2: VB-Audio Virtual Cable (Cross-platform)

Works on both Mac and Windows but requires more setup:

1. Download from: https://vb-audio.com/Cable/
2. Install the Mac driver package
3. Configure audio routing similar to BlackHole setup

### Option 3: Microphone-Only Mode

If you don't need system audio capture:
- Just click "Listen" and it will use microphone only
- Perfect for in-person meetings or when you're presenting

## How It Works

1. **System Audio Detection**: Automatically detects virtual audio devices
2. **Audio Mixing**: Combines microphone and system audio with optimized levels
3. **Real-time Processing**: Transcribes and analyzes audio every 2-3 seconds
4. **Meeting Context**: Provides meeting-specific responses and summaries
5. **Smart Responses**: Can answer questions directed at you or provide meeting insights

## Development

```bash
# Install dependencies
npm install

# Start development
npm run dev
```

## Meeting Assistant Features

- **Automatic Meeting Detection**: Detects when you're in video calls
- **Real-time Transcription**: Powered by Deepgram
- **Intelligent Responses**: Context-aware meeting assistance
- **Question Answering**: Can respond to questions directed at you
- **Meeting Summaries**: Provides real-time meeting insights
- **Smart Audio Processing**: Optimized for meeting scenarios

## Troubleshooting

### No System Audio
- Ensure BlackHole is installed and selected as output device
- Check that Multi-Output Device includes BlackHole
- Verify app shows "System + Mic" status

### Audio Quality Issues
- Try different sample rates in Audio MIDI Setup
- Ensure microphone permissions are granted
- Check that only one app is using microphone at a time

### Performance Issues
- Close other audio applications
- Restart CoreAudio: `sudo killall coreaudiod`
- Check CPU usage during meetings

## License

MIT License - see LICENSE file for details. 