/*
 * Originally created by Prathit (https://github.com/Prat011)

 * - Added extensive audio recording capabilities with system audio support
 * - Added real-time transcription and meeting assistant features
 * - Enhanced UI for audio recording with better status indicators
 * - Added conversation history and chat-like interface
 * - Improved audio processing with multiple input sources
 * 
 * Licensed under the Apache License, Version 2.0
 */

import React, { useState, useEffect, useRef } from "react"

interface ConversationMessage {
  type: 'user' | 'ai'
  content: string
  timestamp: Date
}

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots: _screenshots
}) => {
  const [isListening, setIsListening] = useState(false)
  const [audioAnalysisResult, setAudioAnalysisResult] = useState<string | null>(null)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [showFullConversation, setShowFullConversation] = useState(false)
  const [hasSystemAudio, setHasSystemAudio] = useState(false)
  const [aiMode, setAiMode] = useState<'meeting' | 'conversation'>('meeting')
  const conversationEndRef = useRef<HTMLDivElement>(null)
  
  // Web Audio API refs
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const scriptProcessor = useRef<ScriptProcessorNode | null>(null)
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioStream = useRef<MediaStream | null>(null)
  const audioData = useRef<Float32Array[]>([])
  const sampleRate = useRef<number>(44100)
  const mixingContext = useRef<AudioContext | null>(null)
  const systemStream = useRef<MediaStream | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const recordedChunks = useRef<Blob[]>([])
  const mixerGainNode = useRef<GainNode | null>(null)
  const mixerDebugInterval = useRef<NodeJS.Timeout | null>(null)
  const destinationStream = useRef<MediaStream | null>(null)
  const recordedBlob = useRef<Blob | null>(null)
  
  // Timing and control refs
  const silenceTimer = useRef<NodeJS.Timeout | null>(null)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const restartTimer = useRef<NodeJS.Timeout | null>(null)
  const volumeCheckInterval = useRef<NodeJS.Timeout | null>(null)
  const speechProcessingTimer = useRef<NodeJS.Timeout | null>(null)
  const isListeningRef = useRef(false)
  const isAiThinkingRef = useRef(false)
  const [isRecorderRestarting, setIsRecorderRestarting] = useState(false)
  const lastVolumeCheck = useRef<number>(Date.now())
  const isSpeaking = useRef<boolean>(false)
  const silenceStartTime = useRef<number>(0)
  const justRestarted = useRef<boolean>(false)
  const isProcessing = useRef<boolean>(false)
  const recordingStartTime = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebAudioRecording()
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      if (durationTimer.current) clearInterval(durationTimer.current)
      if (restartTimer.current) clearTimeout(restartTimer.current)
      if (volumeCheckInterval.current) clearInterval(volumeCheckInterval.current)
      if (speechProcessingTimer.current) clearTimeout(speechProcessingTimer.current)
      
      // Additional cleanup for mixing context and system stream
      if (mixingContext.current) {
        mixingContext.current.close()
        mixingContext.current = null
      }
      if (systemStream.current) {
        systemStream.current.getTracks().forEach(track => track.stop())
        systemStream.current = null
      }
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop()
        mediaRecorder.current = null
      }
      if (mixerDebugInterval.current) {
        clearInterval(mixerDebugInterval.current)
        mixerDebugInterval.current = null
      }
    }
  }, [])

  // Listen for global shortcut
  useEffect(() => {
    const cleanup = window.electronAPI.onToggleListenMode(() => {
      handleListenClick()
    })
    return cleanup
  }, [isListening])

  // Update refs when state changes
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    isAiThinkingRef.current = isAiThinking
  }, [isAiThinking])

  // Debug hasSystemAudio state changes
  useEffect(() => {
    window.electronAPI.debugLog(`🎤 [STATE] hasSystemAudio changed to: ${hasSystemAudio}`)
  }, [hasSystemAudio])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (conversationEndRef.current && showFullConversation) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [conversationHistory, showFullConversation])

  const addMessageToConversation = (type: 'user' | 'ai', content: string) => {
    const newMessage: ConversationMessage = {
      type,
      content,
      timestamp: new Date()
    }
    setConversationHistory(prev => [...prev, newMessage])
    
    // Auto-show full conversation when we have multiple exchanges
    if (conversationHistory.length >= 2) {
      setShowFullConversation(true)
    }
  }

  // Convert Float32Array to WAV file
  const createWavFile = (audioBuffer: Float32Array[], sampleRate: number): Blob => {
    window.electronAPI.debugLog(`🎤 [WAV] Creating WAV file from ${audioBuffer.length} chunks, sample rate: ${sampleRate}`)
    
    // Concatenate all audio data
    const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const mergedAudio = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of audioBuffer) {
      mergedAudio.set(chunk, offset)
      offset += chunk.length
    }
    
    // Convert float32 to int16
    const length = mergedAudio.length
    const arrayBuffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(arrayBuffer)
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // Subchunk1Size
    view.setUint16(20, 1, true) // AudioFormat (PCM)
    view.setUint16(22, 1, true) // NumChannels (mono)
    view.setUint32(24, sampleRate, true) // SampleRate
    view.setUint32(28, sampleRate * 2, true) // ByteRate
    view.setUint16(32, 2, true) // BlockAlign
    view.setUint16(34, 16, true) // BitsPerSample
    writeString(36, 'data')
    view.setUint32(40, length * 2, true)
    
    // Convert float samples to 16-bit PCM
    let offset2 = 44
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, mergedAudio[i]))
      view.setInt16(offset2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      offset2 += 2
    }
    
    const wavBlob = new Blob([arrayBuffer], { type: 'audio/wav' })
    window.electronAPI.debugLog(`🎤 [WAV] Created WAV file: ${wavBlob.size} bytes`)
    return wavBlob
  }

  const setupSilenceDetection = (stream: MediaStream) => {
    try {
      window.electronAPI.debugLog(`🎤 [SILENCE-SETUP] Setting up silence detection for stream with ${stream.getTracks().length} tracks`)
      
      // Create audio context for volume analysis
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyserNode = audioCtx.createAnalyser()
      
      analyserNode.fftSize = 256
      const bufferLength = analyserNode.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      
      source.connect(analyserNode)
      audioContext.current = audioCtx
      analyser.current = analyserNode
      
      // Clear any existing volume check
      if (volumeCheckInterval.current) {
        window.electronAPI.debugLog(`🎤 [SILENCE-SETUP] Clearing existing volume check interval`)
        clearInterval(volumeCheckInterval.current)
      }
      
      // Check volume every 100ms
      volumeCheckInterval.current = setInterval(() => {
        if (!isListeningRef.current || isAiThinkingRef.current || isRecorderRestarting) {
          // window.electronAPI.debugLog(`🎤 [VOLUME-SKIP] listening: ${isListeningRef.current}, thinking: ${isAiThinkingRef.current}, restarting: ${isRecorderRestarting}`)
          return
        }
        
        analyserNode.getByteFrequencyData(dataArray)
        
        // Calculate average volume
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const averageVolume = sum / bufferLength
        
        // Log volume periodically
        if (Date.now() % 1000 < 100) { // Log roughly once per second
          const currentHasSystemAudio = mixerGainNode.current !== null
          const hasRecordedData = audioData.current.length > 0 || recordedBlob.current !== null
          window.electronAPI.debugLog(`🎤 [VOLUME-DETECT] Volume: ${averageVolume.toFixed(2)}, hasData: ${hasRecordedData}, hasSystemAudio: ${currentHasSystemAudio} (state: ${hasSystemAudio})`)
        }
        
        const now = Date.now()
        // Lower threshold when we have system audio to catch meeting participants
        const currentHasSystemAudio = mixerGainNode.current !== null
        const SPEECH_THRESHOLD = currentHasSystemAudio ? 8 : 15 
        const SILENCE_DURATION = 2500 // 2.5 seconds of silence before processing
        
        if (averageVolume > SPEECH_THRESHOLD) {
          // User is speaking
          if (!isSpeaking.current) {
            window.electronAPI.debugLog(`🎤 [SPEECH] Detected speech (volume: ${averageVolume.toFixed(1)})`)
            isSpeaking.current = true
            
            // Set fallback processing timer - process after 8 seconds of any speech activity
            if (speechProcessingTimer.current) {
              clearTimeout(speechProcessingTimer.current)
            }
            speechProcessingTimer.current = setTimeout(() => {
              const hasAudioData = audioData.current.length > 0 || recordedBlob.current !== null
              if (hasAudioData && !isProcessing.current) {
                const recordingDuration = Date.now() - recordingStartTime.current
                if (recordingDuration >= 4000) {
                  window.electronAPI.debugLog(`🎤 [FALLBACK] Processing after 8s of speech activity (hasData: ${hasAudioData}, ${recordingDuration}ms)`)
                  processCurrentAudio()
                }
              }
            }, 8000)
          }
          silenceStartTime.current = now
        } else {
          // Silence detected
          if (isSpeaking.current) {
            window.electronAPI.debugLog(`🎤 [SILENCE] Speech ended, starting silence timer (volume: ${averageVolume.toFixed(1)})`)
            isSpeaking.current = false
            silenceStartTime.current = now
          }
          
          // Process audio after silence duration
          const silenceDuration = now - silenceStartTime.current
          const hasAudioData = audioData.current.length > 0 || recordedBlob.current !== null
          if (silenceDuration >= SILENCE_DURATION && hasAudioData && !isProcessing.current) {
            const recordingDuration = now - recordingStartTime.current
            window.electronAPI.debugLog(`🎤 [CHECK] Silence: ${silenceDuration}ms, Recording: ${recordingDuration}ms, hasData: ${hasAudioData}`)
            
            if (recordingDuration >= 2000) { // Reduced from 3000ms to 2000ms
              window.electronAPI.debugLog(`🎤 [PROCESS] ${silenceDuration}ms of silence detected - processing audio (hasData: ${hasAudioData}, ${recordingDuration}ms duration)!`)
              
              // Don't clear the interval - let it continue
              processCurrentAudio()
              
              // Reset silence tracking
              silenceStartTime.current = now + 5000 // Prevent immediate re-processing
            } else {
              window.electronAPI.debugLog(`🎤 [SILENCE] ${silenceDuration}ms of silence, but recording too short (${recordingDuration}ms)`)
            }
          }
        }
      }, 100) // Check every 100ms
      
      window.electronAPI.debugLog(`🎤 [SILENCE-SETUP] Volume check interval started, checking every 100ms`)
      window.electronAPI.debugLog("🎤 [SILENCE] Silence detection started")
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [SILENCE] Error setting up silence detection: ${error}`)
    }
  }

  const startWebAudioRecording = async (stream: MediaStream) => {
    try {
      window.electronAPI.debugLog(`🎤 [RECORDING] Starting recording with MediaRecorder approach...`)
      
      // Reset audio data
      audioData.current = []
      recordingStartTime.current = Date.now()
      
      // If we have a mixing context (system audio), record from the mixed stream
      if (mixingContext.current && destinationStream.current) {
        window.electronAPI.debugLog(`🎤 [RECORDING] Using mixed stream from destination node`)
        
        // Use the mixed stream directly with MediaRecorder
        const recorder = new MediaRecorder(destinationStream.current, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 16000
        })
        
        const chunks: Blob[] = []
        let chunkCount = 0
        
        recorder.ondataavailable = (event) => {
          chunkCount++
          if (chunkCount === 1) {
            window.electronAPI.debugLog(`🎤 [RECORDING] First MediaRecorder chunk received!`)
          }
          
          if (event.data.size > 0) {
            chunks.push(event.data)
            window.electronAPI.debugLog(`🎤 [RECORDING] Chunk ${chunks.length}: ${event.data.size} bytes`)
            
            // Create a blob with current chunks for real-time processing
            const currentBlob = new Blob(chunks, { type: 'audio/webm' })
            recordedBlob.current = currentBlob
            window.electronAPI.debugLog(`🎤 [RECORDING] Updated recorded blob: ${currentBlob.size} bytes total`)
          }
        }
        
        recorder.onstop = async () => {
          window.electronAPI.debugLog(`🎤 [RECORDING] MediaRecorder stopped, final blob: ${recordedBlob.current?.size || 0} bytes`)
        }
        
        // Start recording with regular intervals
        recorder.start(100) // Get data every 100ms
        mediaRecorder.current = recorder
        
        window.electronAPI.debugLog(`🎤 [RECORDING] MediaRecorder started for mixed audio`)
        
      } else {
        window.electronAPI.debugLog(`🎤 [RECORDING] Using microphone-only MediaRecorder`)
        
        // Fallback for microphone-only recording
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 16000
        })
        
        const chunks: Blob[] = []
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data)
            
            // Create a blob with current chunks for real-time processing
            const currentBlob = new Blob(chunks, { type: 'audio/webm' })
            recordedBlob.current = currentBlob
            window.electronAPI.debugLog(`🎤 [RECORDING] Updated mic-only blob: ${currentBlob.size} bytes total`)
          }
        }
        
        recorder.onstop = async () => {
          window.electronAPI.debugLog(`🎤 [RECORDING] Mic-only MediaRecorder stopped, final blob: ${recordedBlob.current?.size || 0} bytes`)
        }
        
        recorder.start(100)
        mediaRecorder.current = recorder
      }
      
      audioStream.current = stream
      
      window.electronAPI.debugLog(`🎤 [RECORDING] Recording started with MediaRecorder`)
      
      // Test if MediaRecorder is working
      setTimeout(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          window.electronAPI.debugLog(`🎤 [RECORDING] SUCCESS: MediaRecorder is actively recording`)
        } else {
          window.electronAPI.debugLog(`🎤 [RECORDING] ERROR: MediaRecorder not recording after 3 seconds!`)
        }
      }, 3000)
      
      // Set up restart timer
      restartTimer.current = setTimeout(() => {
        if (isListeningRef.current) {
          restartAudioCapture()
        }
      }, 30000)
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [RECORDING] Error starting recording: ${error}`)
      throw error
    }
  }

  const restartAudioCapture = async () => {
    if (!isListeningRef.current || isRecorderRestarting) return
    
    window.electronAPI.debugLog("🎤 [RESTART] Starting audio capture restart...")
    setIsRecorderRestarting(true)
    
    try {
      // Process any existing audio first
      if (audioData.current.length > 0) {
        const recordingDuration = Date.now() - recordingStartTime.current
        if (recordingDuration >= 3000) {
          window.electronAPI.debugLog("🎤 [RESTART] Processing existing audio before restart")
          await processCurrentAudio()
        }
      }
      
      // Clear old audio data
      audioData.current = []
      recordingStartTime.current = Date.now()
      justRestarted.current = true
      
      // Restart silence detection with existing stream
      if (audioStream.current && volumeCheckInterval.current === null) {
        setupSilenceDetection(audioStream.current)
      }
      
      window.electronAPI.debugLog("🎤 [RESTART] Audio capture restarted")
      
      // Schedule next restart
      if (restartTimer.current) {
        clearTimeout(restartTimer.current)
      }
      restartTimer.current = setTimeout(() => {
        if (isListeningRef.current) {
          restartAudioCapture()
        }
      }, 30000)
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [RESTART] Error restarting: ${error}`)
    } finally {
      setIsRecorderRestarting(false)
      setTimeout(() => {
        justRestarted.current = false
      }, 1000)
    }
  }

  const processCurrentAudio = async () => {
    if (isProcessing.current || (audioData.current.length === 0 && !recordedBlob.current)) {
      window.electronAPI.debugLog(`🎤 [PROCESS] Skipping processing - already processing: ${isProcessing.current}, audio chunks: ${audioData.current.length}, recorded blob: ${!!recordedBlob.current}`)
      return
    }
    
    isProcessing.current = true
    window.electronAPI.debugLog(`🎤 [PROCESS] *** STARTING AUDIO PROCESSING ***`)
    
    try {
      let audioBlob: Blob
      
      // Check if we have a recorded blob from MediaRecorder (preferred for mixed audio)
      if (recordedBlob.current) {
        window.electronAPI.debugLog(`🎤 [PROCESS] Using MediaRecorder blob: ${recordedBlob.current.size} bytes`)
        audioBlob = recordedBlob.current
      } else if (audioData.current.length > 0) {
        window.electronAPI.debugLog(`🎤 [PROCESS] Creating WAV from ${audioData.current.length} audio chunks`)
        audioBlob = createWavFile(audioData.current, sampleRate.current)
        window.electronAPI.debugLog(`🎤 [PROCESS] WAV file created, size: ${audioBlob.size} bytes`)
      } else {
        window.electronAPI.debugLog(`🎤 [PROCESS] No audio data available`)
        isProcessing.current = false
        return
      }
      
      // Convert to base64
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1]
          window.electronAPI.debugLog(`🎤 [PROCESS] Converted to base64: ${base64Data.length} chars`)
          window.electronAPI.debugLog(`🎤 [PROCESS] Calling AI analysis...`)
          
          setIsAiThinking(true)
          
          // Use appropriate MIME type
          const mimeType = recordedBlob.current ? 'audio/webm' : 'audio/wav'
          const result = await (window.electronAPI as any).analyzeAudioConversational(base64Data, mimeType, aiMode)
          
          window.electronAPI.debugLog(`🎤 [PROCESS] AI analysis complete!`)
          
          if (result && result.text && result.text.trim()) {
            window.electronAPI.debugLog(`🎤 [SUCCESS] Got AI response: ${result.text.substring(0, 50)}...`)
            setAudioAnalysisResult(result.text)
            addMessageToConversation('ai', result.text)
          } else {
            window.electronAPI.debugLog(`🎤 [SILENCE] Empty response (silence detected)`)
          }
        } catch (error) {
          window.electronAPI.debugLog(`🎤 [ERROR] Processing failed: ${error}`)
          console.error("Processing error:", error)
        } finally {
          setIsAiThinking(false)
          isProcessing.current = false
          window.electronAPI.debugLog(`🎤 [PROCESS] *** PROCESSING COMPLETE ***`)
          
          // Clear speech processing timer since we just processed
          if (speechProcessingTimer.current) {
            clearTimeout(speechProcessingTimer.current)
            speechProcessingTimer.current = null
          }
          
          // Clear processed audio data
          audioData.current = []
          recordedBlob.current = null
          recordingStartTime.current = Date.now()
        }
      }
      
      reader.readAsDataURL(audioBlob)
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [ERROR] Failed to process audio: ${error}`)
      console.error("Process audio error:", error)
      isProcessing.current = false
    }
  }

  const stopWebAudioRecording = () => {
    try {
      window.electronAPI.debugLog("🎤 [STOP] Stopping Web Audio recording...")
      
      // Stop MediaRecorder if active
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        window.electronAPI.debugLog("🎤 [STOP] Stopping MediaRecorder...")
        mediaRecorder.current.stop()
        mediaRecorder.current = null
      }
      
      if (scriptProcessor.current) {
        scriptProcessor.current.disconnect()
        scriptProcessor.current = null
      }
      
      if (microphone.current) {
        microphone.current.disconnect()
        microphone.current = null
      }
      
      if (audioContext.current) {
        audioContext.current.close()
        audioContext.current = null
      }
      
      if (audioStream.current) {
        audioStream.current.getTracks().forEach(track => track.stop())
        audioStream.current = null
      }
      
      // Clean up mixing context and system stream
      if (mixingContext.current) {
        mixingContext.current.close()
        mixingContext.current = null
      }
      
      if (systemStream.current) {
        systemStream.current.getTracks().forEach(track => track.stop())
        systemStream.current = null
      }
      
      // Clear destination stream and recorded blob
      destinationStream.current = null
      recordedBlob.current = null
      
      // Clear mixer gain node and debug interval
      mixerGainNode.current = null
      if (mixerDebugInterval.current) {
        clearInterval(mixerDebugInterval.current)
        mixerDebugInterval.current = null
      }
      
      // Clear all timers
      if (restartTimer.current) {
        clearTimeout(restartTimer.current)
        restartTimer.current = null
      }
      
      if (volumeCheckInterval.current) {
        clearInterval(volumeCheckInterval.current)
        volumeCheckInterval.current = null
      }
      
      if (durationTimer.current) {
        clearInterval(durationTimer.current)
        durationTimer.current = null
      }
      
      // Reset all state
      audioData.current = []
      justRestarted.current = false
      isProcessing.current = false
      
      window.electronAPI.debugLog("🎤 [STOP] Web Audio recording stopped")
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [STOP] Error stopping recording: ${error}`)
    }
  }

  const handleListenClick = async () => {
    if (isListening) {
      await stopListening()
    } else {
      await startListening()
    }
  }

  const startListening = async () => {
    try {
      window.electronAPI.debugLog("🎤 [START] Starting listening mode...")
      setIsListening(true)
      
      // Request microphone access
      window.electronAPI.debugLog("🎤 [START] Requesting microphone access...")
      const micConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
          channelCount: 1
        }
      }
      
      const micStream = await navigator.mediaDevices.getUserMedia(micConstraints)
      window.electronAPI.debugLog("🎤 [START] Microphone access granted!")
      
      let combinedStream = micStream
      
      // Try BlackHole or other virtual audio devices for system audio capture
      try {
        window.electronAPI.debugLog("🎤 [START] Checking for virtual audio devices (BlackHole, VB-Cable, etc.)...")
        
        // Check available audio input devices
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(device => device.kind === 'audioinput')
        
        window.electronAPI.debugLog(`🎤 [START] Found ${audioInputs.length} audio input devices`)
        audioInputs.forEach(device => {
          window.electronAPI.debugLog(`🎤 [DEVICE] ${device.label} (${device.deviceId})`)
        })
        
        // Look for virtual audio devices (detailed debugging)
        window.electronAPI.debugLog(`🎤 [SEARCH] Looking for devices containing: blackhole, vb-cable, virtual cable, loopback`)
        audioInputs.forEach(device => {
          const deviceName = device.label.toLowerCase()
          const isVirtual = deviceName.includes('blackhole') || 
                           deviceName.includes('vb-cable') || 
                           deviceName.includes('virtual cable') || 
                           deviceName.includes('loopback')
          window.electronAPI.debugLog(`🎤 [SCAN] "${device.label}" -> Virtual: ${isVirtual}`)
        })
        
        const virtualAudioDevice = audioInputs.find(device => 
          device.label.toLowerCase().includes('blackhole') ||
          device.label.toLowerCase().includes('vb-cable') ||
          device.label.toLowerCase().includes('virtual cable') ||
          device.label.toLowerCase().includes('loopback')
        )

        if (virtualAudioDevice) {
          window.electronAPI.debugLog(`🎤 [START] Found virtual audio device: ${virtualAudioDevice.label}`)
          
          // Capture from the virtual audio device
          const virtualStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: virtualAudioDevice.deviceId,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100,
              channelCount: 2
            }
          })

          window.electronAPI.debugLog("🎤 [START] Virtual audio device connected! Mixing with microphone...")
          
          // Create audio context for mixing
          const audioCtx = new AudioContext()
          const micSource = audioCtx.createMediaStreamSource(micStream)
          const systemSource = audioCtx.createMediaStreamSource(virtualStream)
          const destination = audioCtx.createMediaStreamDestination()
          
          // Create gain nodes for volume control
          const micGain = audioCtx.createGain()
          const systemGain = audioCtx.createGain()
          
          // Set volumes for meeting scenarios
          micGain.gain.value = 0.8 // User's voice
          systemGain.gain.value = 0.6 // System audio (videos, etc.)
          
          // Create a mixer gain node
          const mixerGain = audioCtx.createGain()
          mixerGain.gain.value = 1.0
          
          // Connect audio graph
          micSource.connect(micGain)
          systemSource.connect(systemGain)
          micGain.connect(mixerGain)
          systemGain.connect(mixerGain)
          mixerGain.connect(destination)
          
          // Store refs for cleanup and recording
          mixingContext.current = audioCtx
          systemStream.current = virtualStream
          mixerGainNode.current = mixerGain
          destinationStream.current = destination.stream
          
          // Use the mixed stream
          combinedStream = destination.stream
          setHasSystemAudio(true)
          window.electronAPI.debugLog("🎤 [START] Virtual audio device mixing successful!")
          
        } else {
          // Fallback to screen capture approach
          window.electronAPI.debugLog("🎤 [START] No virtual audio devices found, trying screen capture...")
          
          const systemStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: {
              mediaSource: 'screen',
              width: { max: 1 },
              height: { max: 1 }
            },
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100
            }
          })
          
          // Stop video track immediately since we only want audio
          const videoTracks = systemStream.getVideoTracks()
          videoTracks.forEach((track: MediaStreamTrack) => track.stop())
          
          if (systemStream.getAudioTracks().length > 0) {
            window.electronAPI.debugLog("🎤 [START] Screen capture audio successful! Mixing with microphone...")
            
            // Create audio context for mixing
            const audioCtx = new AudioContext()
            const micSource = audioCtx.createMediaStreamSource(micStream)
            const systemSource = audioCtx.createMediaStreamSource(systemStream)
            const destination = audioCtx.createMediaStreamDestination()
            
            // Create gain nodes for volume control
            const micGain = audioCtx.createGain()
            const systemGain = audioCtx.createGain()
            
            // Set volumes for meeting scenarios
            micGain.gain.value = 0.8 // User's voice
            systemGain.gain.value = 0.6 // System audio (videos, etc.)
            
            // Create a mixer gain node
            const mixerGain = audioCtx.createGain()
            mixerGain.gain.value = 1.0
            
            // Connect audio graph
            micSource.connect(micGain)
            systemSource.connect(systemGain)
            micGain.connect(mixerGain)
            systemGain.connect(mixerGain)
            mixerGain.connect(destination)
            
            // Store refs for cleanup and recording
            mixingContext.current = audioCtx
            systemStream.current = systemStream
            mixerGainNode.current = mixerGain
            destinationStream.current = destination.stream
            
            // Use the mixed stream
            combinedStream = destination.stream
            setHasSystemAudio(true)
            window.electronAPI.debugLog("🎤 [START] Screen capture mixing successful!")
            
          } else {
            throw new Error("No audio tracks in screen capture")
          }
        }
        
      } catch (cleanError) {
        window.electronAPI.debugLog(`🎤 [START] System audio capture failed: ${cleanError}`)
        window.electronAPI.debugLog("🎤 [START] Falling back to microphone-only mode")
        window.electronAPI.debugLog("🎤 [SETUP] For system audio capture, install BlackHole: brew install blackhole-2ch")
        window.electronAPI.debugLog("🎤 [SETUP] Then set up a Multi-Output Device in Audio MIDI Setup")
        // Continue with microphone-only
      }
      
      // Legacy system audio code (commented out)
      /*
      // Try to get system audio and mix with microphone using Electron's native API
      try {
        window.electronAPI.debugLog("🎤 [START] Getting desktop sources for system audio...")
        const sources = await window.electronAPI.getDesktopSources()
        
        if (sources.length > 0) {
          window.electronAPI.debugLog(`🎤 [START] Found ${sources.length} desktop sources, trying system audio...`)
          
          // Try to get system audio using the first screen source
          const screenSource = sources.find(source => source.name.includes('Screen') || source.name.includes('Entire'))
          const sourceId = screenSource ? screenSource.id : sources[0].id
          
          window.electronAPI.debugLog(`🎤 [START] Using source: ${sourceId}`)
          
          // Use modern constraints format for system audio
          const constraints = {
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
              },
              optional: [
                { echoCancellation: false },
                { noiseSuppression: false },
                { autoGainControl: false }
              ]
            },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: 1,
                maxHeight: 1
              }
            }
          }
          
          window.electronAPI.debugLog(`🎤 [START] Requesting system audio with constraints...`)
          const systemStream = await (navigator.mediaDevices as any).getUserMedia(constraints)
          
          // Stop video track immediately since we only want audio
          const videoTracks = systemStream.getVideoTracks()
          videoTracks.forEach((track: MediaStreamTrack) => track.stop())
          
          if (systemStream.getAudioTracks().length > 0) {
            window.electronAPI.debugLog("🎤 [START] System audio access granted! Mixing with microphone...")
            
            // Create audio context for mixing
            const audioCtx = new AudioContext()
            const micSource = audioCtx.createMediaStreamSource(micStream)
            const systemSource = audioCtx.createMediaStreamSource(systemStream)
            const destination = audioCtx.createMediaStreamDestination()
            
            // Create gain nodes for volume control
            const micGain = audioCtx.createGain()
            const systemGain = audioCtx.createGain()
            
            // Set volumes (can be adjusted for meetings)
            micGain.gain.value = 0.7 // Slightly lower microphone for meetings
            systemGain.gain.value = 1.0 // Full system audio to hear meeting participants
            
            // Create a mixer gain node that will receive both inputs
            const mixerGain = audioCtx.createGain()
            mixerGain.gain.value = 1.0
            
            // Add debug analysers for input sources
            const micAnalyser = audioCtx.createAnalyser()
            const sysAnalyser = audioCtx.createAnalyser()
            micAnalyser.fftSize = 256
            sysAnalyser.fftSize = 256
            
            // Connect audio graph with debug taps
            micSource.connect(micAnalyser)
            micAnalyser.connect(micGain)
            systemSource.connect(sysAnalyser)
            sysAnalyser.connect(systemGain)
            micGain.connect(mixerGain)
            systemGain.connect(mixerGain)
            
            // Monitor input levels
            const checkInputs = setInterval(() => {
              const micData = new Uint8Array(micAnalyser.frequencyBinCount)
              const sysData = new Uint8Array(sysAnalyser.frequencyBinCount)
              micAnalyser.getByteFrequencyData(micData)
              sysAnalyser.getByteFrequencyData(sysData)
              const micLevel = micData.reduce((sum, val) => sum + val, 0) / micData.length
              const sysLevel = sysData.reduce((sum, val) => sum + val, 0) / sysData.length
              window.electronAPI.debugLog(`🎤 [INPUT-LEVELS] Mic: ${micLevel.toFixed(2)}, System: ${sysLevel.toFixed(2)}`)
            }, 4000)
            
            // Connect mixer to destination for stream output
            mixerGain.connect(destination)
            
            // Add debug monitoring to check if mixer receives audio
            const debugAnalyser = audioCtx.createAnalyser()
            debugAnalyser.fftSize = 256
            mixerGain.connect(debugAnalyser)
            
            const checkMixerAudio = setInterval(() => {
              const dataArray = new Uint8Array(debugAnalyser.frequencyBinCount)
              debugAnalyser.getByteFrequencyData(dataArray)
              const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
              window.electronAPI.debugLog(`🎤 [MIXER-NATIVE] Mixer output level: ${average.toFixed(2)}`)
            }, 3000)
            
            // Store cleanup function
            mixerDebugInterval.current = checkMixerAudio
            
            // Store the mixer gain node so we can tap into it for recording
            mixerGainNode.current = mixerGain
            
            // Store refs for cleanup
            mixingContext.current = audioCtx
            systemStream.current = systemStream
            
            // Store the destination stream for MediaRecorder
            destinationStream.current = destination.stream
            
            // Use the mixed stream
            combinedStream = destination.stream
            window.electronAPI.debugLog("🎤 [START] Native system audio mixing successful!")
            
            // Set hasSystemAudio immediately
            setHasSystemAudio(true)
          }
        } else {
          window.electronAPI.debugLog("🎤 [START] No desktop sources found")
        }
              } catch (sysError) {
          window.electronAPI.debugLog(`🎤 [START] Native system audio failed: ${sysError}`)
          window.electronAPI.debugLog(`🎤 [START] Error details: ${JSON.stringify(sysError)}`)
          
          // Fallback to display media approach
        try {
          window.electronAPI.debugLog("🎤 [START] Trying fallback display media capture...")
          const systemStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: {
              mediaSource: 'screen',
              width: { max: 1 },
              height: { max: 1 }
            },
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100
            }
          })
          
          if (systemStream.getAudioTracks().length > 0) {
            window.electronAPI.debugLog("🎤 [START] Fallback system audio successful!")
            
            // Stop the video track since we only want audio
            const videoTracks = systemStream.getVideoTracks()
            videoTracks.forEach((track: MediaStreamTrack) => track.stop())
            
            // Mix with microphone
            const audioCtx = new AudioContext()
            const micSource = audioCtx.createMediaStreamSource(micStream)
            const systemSource = audioCtx.createMediaStreamSource(systemStream)
            const destination = audioCtx.createMediaStreamDestination()
            
            const micGain = audioCtx.createGain()
            const systemGain = audioCtx.createGain()
            
            micGain.gain.value = 0.7
            systemGain.gain.value = 1.0
            
            // Create a mixer gain node that will receive both inputs
            const mixerGain = audioCtx.createGain()
            mixerGain.gain.value = 1.0
            
            micSource.connect(micGain)
            systemSource.connect(systemGain)
            micGain.connect(mixerGain)
            systemGain.connect(mixerGain)
            
            // Connect mixer to destination for stream output
            mixerGain.connect(destination)
            
            // Add debug monitoring to check if fallback mixer receives audio
            const debugAnalyser = audioCtx.createAnalyser()
            debugAnalyser.fftSize = 256
            mixerGain.connect(debugAnalyser)
            
            const checkMixerAudio = setInterval(() => {
              const dataArray = new Uint8Array(debugAnalyser.frequencyBinCount)
              debugAnalyser.getByteFrequencyData(dataArray)
              const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
              window.electronAPI.debugLog(`🎤 [MIXER-FALLBACK] Mixer output level: ${average.toFixed(2)}`)
            }, 3000)
            
            // Store cleanup function
            mixerDebugInterval.current = checkMixerAudio
            
            // Store the mixer gain node so we can tap into it for recording
            mixerGainNode.current = mixerGain
            
            // Store the destination stream for MediaRecorder
            destinationStream.current = destination.stream
            
            mixingContext.current = audioCtx
            systemStream.current = systemStream
            combinedStream = destination.stream
            window.electronAPI.debugLog("🎤 [START] Fallback audio mixing successful!")
            
            // Set hasSystemAudio immediately
            setHasSystemAudio(true)
          }
        } catch (fallbackError) {
          window.electronAPI.debugLog(`🎤 [START] All system audio methods failed, using microphone only: ${fallbackError}`)
        }
      }
      */
      
      // Start Web Audio API recording with combined stream
      await startWebAudioRecording(combinedStream)
      
      // Set up silence detection
      setupSilenceDetection(combinedStream)
      
      // Start duration timer
      setRecordingDuration(0)
      durationTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
      window.electronAPI.debugLog("🎤 [START] Listening mode started successfully!")
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [ERROR] Failed to start listening: ${error}`)
      setIsListening(false)
      alert(`Failed to start listening: ${error}`)
    }
  }

  const stopListening = async () => {
    window.electronAPI.debugLog("🎤 [STOP] Stopping listening mode")
    
    // Stop Web Audio recording
    stopWebAudioRecording()
    
    // Clear all timers
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current)
      silenceTimer.current = null
    }
    if (durationTimer.current) {
      clearInterval(durationTimer.current)
      durationTimer.current = null
    }
    if (volumeCheckInterval.current) {
      clearInterval(volumeCheckInterval.current)
      volumeCheckInterval.current = null
    }
    if (speechProcessingTimer.current) {
      clearTimeout(speechProcessingTimer.current)
      speechProcessingTimer.current = null
    }
    
    // Reset restart flags
    justRestarted.current = false
    isProcessing.current = false
    
    setIsListening(false)
    setDebugInfo("")
    setRecordingDuration(0)
    setHasSystemAudio(false)
    
    // Clear mixer gain node reference
    mixerGainNode.current = null
    
    // Clear mixer debug interval
    if (mixerDebugInterval.current) {
      clearInterval(mixerDebugInterval.current)
      mixerDebugInterval.current = null
    }
    
    // Auto-switch back to normal audio mode
    try {
      window.electronAPI.debugLog('🎧 [STOP] Switching back to normal audio mode...')
      const result = await (window.electronAPI as any).switchAudioMode('normal')
      if (result.success) {
        window.electronAPI.debugLog('✅ [STOP] Successfully switched back to normal audio mode')
      } else {
        window.electronAPI.debugLog(`⚠️ [STOP] Failed to switch audio mode: ${result.error}`)
      }
    } catch (error) {
      window.electronAPI.debugLog(`❌ [STOP] Error switching audio mode: ${error}`)
    }
    
    // Clear conversation history for fresh start next time
    setConversationHistory([])
    setShowFullConversation(false)
    window.electronAPI.clearListenConversation()
    window.electronAPI.debugLog("🎤 [STOP] Listening stopped and cleaned up")
  }

  const handleAskClick = async () => {
    try {
      await window.electronAPI.takeScreenshotAndAnalyze()
    } catch (error) {
      console.error("Error taking screenshot and analyzing:", error)
    }
  }

  return (
    <div className="w-fit">
      <div className="backdrop-blur-lg bg-black/40 rounded-full px-4 py-2 flex items-center gap-3 border border-white/10 shadow-lg">
        {/* Mode Toggle Button */}
        <button
          onClick={() => setAiMode(prev => prev === 'meeting' ? 'conversation' : 'meeting')}
          className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
            aiMode === 'meeting'
              ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
              : 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
          }`}
          title={aiMode === 'meeting' ? 'Switch to Conversation Helper' : 'Switch to Meeting Assistant'}
        >
          {aiMode === 'meeting' ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0H8m8 0v2a2 2 0 002 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8a2 2 0 012-2V6" />
              </svg>
              Meeting
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
              Chat
            </>
          )}
        </button>

        {/* Listen Button */}
                <button
          onClick={handleListenClick}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            isListening 
              ? hasSystemAudio
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
                : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
              : 'bg-white/10 text-white/90 hover:bg-white/20'
          }`}
        >
          {isListening ? (
            <>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {aiMode === 'meeting' ? (hasSystemAudio ? 'Meeting Mode' : 'Listen') : 'Chat Helper'}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {aiMode === 'meeting' ? 'Listen' : 'Chat Helper'}
            </>
          )}
        </button>

        {/* System Audio Status */}
        {isListening && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              hasSystemAudio 
                ? 'bg-green-500/20 border border-green-400/30 text-green-200' 
                : 'bg-blue-500/20 border border-blue-400/30 text-blue-200'
            }`}>
              {hasSystemAudio ? (
                <>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Virtual Audio Active
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  Mic Only
                </>
              )}
            </div>
            
            {/* Manual Process Button */}
            <button
              onClick={() => {
                const hasAudioData = audioData.current.length > 0 || recordedBlob.current !== null
                window.electronAPI.debugLog(`🎤 [MANUAL] Manual processing clicked - chunks: ${audioData.current.length}, blob: ${!!recordedBlob.current}, processing: ${isProcessing.current}`)
                if (hasAudioData && !isProcessing.current) {
                  window.electronAPI.debugLog("🎤 [MANUAL] Manual processing triggered")
                  processCurrentAudio()
                } else {
                  window.electronAPI.debugLog(`🎤 [MANUAL] Cannot process - no audio data or already processing`)
                }
              }}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                (audioData.current.length === 0 && !recordedBlob.current) || isProcessing.current 
                  ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed' 
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
              disabled={(audioData.current.length === 0 && !recordedBlob.current) || isProcessing.current}
            >
              Process Now ({recordedBlob.current ? 'Recorded' : audioData.current.length})
            </button>
          </div>
        )}

        {/* Ask Button */}
        <button
          onClick={handleAskClick}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Ask
            </button>

        {/* Show/Hide Button */}
        <div className="flex items-center gap-2 px-3 py-2 text-white/70">
          <span className="text-sm">Show/Hide</span>
          <div className="flex gap-1">
            <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs">⌘</kbd>
            <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-xs">B</kbd>
          </div>
        </div>

        {/* Listen Shortcut Hint */}
        <div className="flex items-center gap-2 px-3 py-2 text-white/50 text-xs">
          <span>⌘L to toggle</span>
        </div>
          </div>

            {/* Setup Guide */}
      {isListening && !hasSystemAudio && aiMode === 'meeting' && (
        <div className="mt-2 p-3 bg-blue-500/10 backdrop-blur-md rounded-xl text-xs text-blue-200 border border-blue-400/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
            <strong>Enable System Audio for Meetings</strong>
          </div>
          <p className="mb-2 text-blue-200/80">
            For the best meeting experience, install BlackHole to capture both your microphone and system audio:
          </p>
          <div className="space-y-1 text-blue-200/70">
            <div>1. Install: <code className="bg-blue-500/20 px-1 rounded">brew install blackhole-2ch</code></div>
            <div>2. Set up Multi-Output Device in Audio MIDI Setup</div>
            <div>3. Restart to detect BlackHole</div>
          </div>
        </div>
      )}

      {/* Conversation Helper Info */}
      {isListening && aiMode === 'conversation' && (
        <div className="mt-2 p-3 bg-purple-500/10 backdrop-blur-md rounded-xl text-xs text-purple-200 border border-purple-400/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
            <strong>Conversation Helper Active</strong>
          </div>
          <p className="text-purple-200/80">
            I'm here to help with social conversations! I'll suggest natural responses, conversation starters, and ways to keep dialogue flowing smoothly.
          </p>
        </div>
      )}

      {/* Debug Info */}
      {debugInfo && isListening && (
        <div className="mt-2 p-2 bg-black/40 backdrop-blur-md rounded-lg text-xs text-white/60 border border-white/5">
          <strong>Debug:</strong> {debugInfo}
        </div>
      )}

      {/* Conversation Interface */}
      {(audioAnalysisResult || conversationHistory.length > 0) && (
        <div className="mt-3">
          {/* Show full conversation if we have history or user wants to see it */}
          {(showFullConversation || conversationHistory.length > 2) && (
            <div className="bg-black/60 backdrop-blur-md rounded-xl text-sm text-white/90 border border-white/10 shadow-lg max-w-lg max-h-96 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isAiThinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
                  <span className="font-medium text-white/90">
                    {aiMode === 'meeting' ? 'Meeting Assistant' : 'Conversation Helper'}
                  </span>
                  <div className={`px-2 py-1 rounded-full text-xs ${
                    aiMode === 'meeting' 
                      ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30' 
                      : 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                  }`}>
                    {aiMode === 'meeting' ? 'Meeting' : 'Chat'}
                  </div>
                      </div>
                <button 
                  onClick={() => setShowFullConversation(false)}
                  className="text-white/50 hover:text-white/80 transition-colors"
                >
                  ✕
                </button>
                    </div>

              {/* Conversation History */}
              <div className="max-h-80 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {conversationHistory.map((message, index) => (
                  <div key={index} className={`flex ${message.type === 'ai' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] p-3 rounded-xl ${
                      message.type === 'ai' 
                        ? 'bg-blue-500/20 border border-blue-400/30 text-blue-100' 
                        : 'bg-green-500/20 border border-green-400/30 text-green-100'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          message.type === 'ai' ? 'bg-blue-400' : 'bg-green-400'
                        }`}></div>
                        <span className="text-xs font-medium opacity-80">
                          {message.type === 'ai' ? 'AI' : 'You'}
                          </span>
                        <span className="text-xs opacity-50">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                      </div>
                      <p className="leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {/* Show thinking indicator */}
                {isAiThinking && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-3 rounded-xl bg-yellow-500/20 border border-yellow-400/30 text-yellow-100">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></div>
                        <span className="text-xs font-medium opacity-80">AI</span>
                      </div>
                      <p className="leading-relaxed">Thinking...</p>
                    </div>
                  </div>
                )}
                
                <div ref={conversationEndRef} />
                      </div>
                    </div>
          )}
          
          {/* Single message view (when no full conversation shown) */}
          {!showFullConversation && conversationHistory.length <= 2 && audioAnalysisResult && (
            <div className="bg-black/60 backdrop-blur-md rounded-xl text-sm text-white/90 border border-white/10 shadow-lg max-w-md">
              <div className="flex items-start gap-2 p-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${isAiThinking ? 'bg-yellow-400 animate-pulse' : 'bg-blue-400'}`}></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <strong className={`${isAiThinking ? 'text-yellow-400' : (aiMode === 'meeting' ? 'text-blue-400' : 'text-purple-400')}`}>
                        {isAiThinking ? 'AI Thinking...' : (aiMode === 'meeting' ? 'Meeting Assistant:' : 'Chat Helper:')}
                      </strong>
                      <div className={`px-1.5 py-0.5 rounded text-xs ${
                        aiMode === 'meeting' 
                          ? 'bg-blue-500/20 text-blue-200' 
                          : 'bg-purple-500/20 text-purple-200'
                      }`}>
                        {aiMode === 'meeting' ? 'Meeting' : 'Chat'} 
                      </div>
                    </div>
                    {conversationHistory.length > 0 && (
                      <button 
                        onClick={() => setShowFullConversation(true)}
                        className="text-xs text-white/50 hover:text-white/80 transition-colors"
                      >
                        Show All ({conversationHistory.length})
                      </button>
                    )}
                  </div>
                  <p className="leading-relaxed">{audioAnalysisResult}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default QueueCommands
