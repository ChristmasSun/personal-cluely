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
  const conversationEndRef = useRef<HTMLDivElement>(null)
  
  // Web Audio API refs
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const scriptProcessor = useRef<ScriptProcessorNode | null>(null)
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioStream = useRef<MediaStream | null>(null)
  const audioData = useRef<Float32Array[]>([])
  const sampleRate = useRef<number>(44100)
  
  // Timing and control refs
  const silenceTimer = useRef<NodeJS.Timeout | null>(null)
  const durationTimer = useRef<NodeJS.Timeout | null>(null)
  const restartTimer = useRef<NodeJS.Timeout | null>(null)
  const volumeCheckInterval = useRef<NodeJS.Timeout | null>(null)
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
        clearInterval(volumeCheckInterval.current)
      }
      
      // Check volume every 100ms
      volumeCheckInterval.current = setInterval(() => {
        if (!isListeningRef.current || isAiThinkingRef.current || isRecorderRestarting) return
        
        analyserNode.getByteFrequencyData(dataArray)
        
        // Calculate average volume
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const averageVolume = sum / bufferLength
        
        const now = Date.now()
        const SPEECH_THRESHOLD = 15 // Adjust this based on testing
        const SILENCE_DURATION = 2500 // 2.5 seconds of silence before processing
        
        if (averageVolume > SPEECH_THRESHOLD) {
          // User is speaking
          if (!isSpeaking.current) {
            window.electronAPI.debugLog(`🎤 [SPEECH] Detected speech (volume: ${averageVolume.toFixed(1)})`)
            isSpeaking.current = true
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
          if (silenceDuration >= SILENCE_DURATION && audioData.current.length > 0 && !isProcessing.current) {
            const recordingDuration = now - recordingStartTime.current
            if (recordingDuration >= 3000) { // At least 3 seconds of recording
              window.electronAPI.debugLog(`🎤 [PROCESS] ${silenceDuration}ms of silence detected - processing audio (${audioData.current.length} chunks, ${recordingDuration}ms duration)!`)
              
              // Clear the interval to prevent multiple processing
              if (volumeCheckInterval.current) {
                clearInterval(volumeCheckInterval.current)
                volumeCheckInterval.current = null
              }
              
              processCurrentAudio()
              
              // Reset silence tracking
              silenceStartTime.current = now + 5000 // Prevent immediate re-processing
            } else {
              window.electronAPI.debugLog(`🎤 [SILENCE] ${silenceDuration}ms of silence, but recording too short (${recordingDuration}ms)`)
            }
          }
        }
      }, 100) // Check every 100ms
      
      window.electronAPI.debugLog("🎤 [SILENCE] Silence detection started")
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [SILENCE] Error setting up silence detection: ${error}`)
    }
  }

  const startWebAudioRecording = async (stream: MediaStream) => {
    try {
      window.electronAPI.debugLog("🎤 [WEB-AUDIO] Starting Web Audio API recording...")
      
      const audioCtx = new AudioContext()
      sampleRate.current = audioCtx.sampleRate
      
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      
      // Reset audio data
      audioData.current = []
      recordingStartTime.current = Date.now()
      
      processor.onaudioprocess = (e) => {
        if (!isListeningRef.current) return
        
        const inputBuffer = e.inputBuffer
        const inputData = inputBuffer.getChannelData(0)
        
        // Copy the audio data (Float32Array)
        const audioChunk = new Float32Array(inputData.length)
        audioChunk.set(inputData)
        audioData.current.push(audioChunk)
      }
      
      source.connect(processor)
      processor.connect(audioCtx.destination)
      
      audioContext.current = audioCtx
      scriptProcessor.current = processor
      microphone.current = source
      audioStream.current = stream
      
      window.electronAPI.debugLog(`🎤 [WEB-AUDIO] Recording started, sample rate: ${audioCtx.sampleRate}Hz`)
      
      // Set up restart timer for fresh audio processing
      restartTimer.current = setTimeout(() => {
        if (isListeningRef.current) {
          restartAudioCapture()
        }
      }, 12000) // Restart every 12 seconds
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [WEB-AUDIO] Error starting recording: ${error}`)
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
      }, 12000)
      
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
    if (isProcessing.current || audioData.current.length === 0) {
      window.electronAPI.debugLog(`🎤 [PROCESS] Skipping processing - already processing: ${isProcessing.current}, audio chunks: ${audioData.current.length}`)
      return
    }
    
    isProcessing.current = true
    
    try {
      window.electronAPI.debugLog(`🎤 [PROCESS] Processing ${audioData.current.length} audio chunks`)
      
      // Create WAV file from audio data
      const wavBlob = createWavFile(audioData.current, sampleRate.current)
      
      // Convert to base64
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1]
          window.electronAPI.debugLog(`🎤 [PROCESS] Converted to base64: ${base64Data.length} chars`)
          
          setIsAiThinking(true)
          const result = await window.electronAPI.analyzeAudioConversational(base64Data, 'audio/wav')
          
          if (result && result.text && result.text.trim()) {
            window.electronAPI.debugLog(`🎤 [SUCCESS] Got AI response: ${result.text.substring(0, 50)}...`)
            setAudioAnalysisResult(result.text)
            addMessageToConversation('ai', result.text)
          } else {
            window.electronAPI.debugLog(`🎤 [SILENCE] Empty response (silence detected)`)
          }
        } catch (error) {
          window.electronAPI.debugLog(`🎤 [ERROR] Processing failed: ${error}`)
        } finally {
          setIsAiThinking(false)
          isProcessing.current = false
          
          // Clear processed audio data
          audioData.current = []
          recordingStartTime.current = Date.now()
        }
      }
      
      reader.readAsDataURL(wavBlob)
      
    } catch (error) {
      window.electronAPI.debugLog(`🎤 [ERROR] Failed to process audio: ${error}`)
      isProcessing.current = false
    }
  }

  const stopWebAudioRecording = () => {
    try {
      window.electronAPI.debugLog("🎤 [STOP] Stopping Web Audio recording...")
      
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
      stopListening()
    } else {
      startListening()
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
      
      // Try to get system audio (will fail on most browsers, but we'll try)
      try {
        window.electronAPI.debugLog("🎤 [START] Requesting system audio access...")
        const systemStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: false,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        })
        
        if (systemStream.getAudioTracks().length > 0) {
          window.electronAPI.debugLog("🎤 [START] System audio access granted!")
          // TODO: Mix system audio with microphone if needed
        }
      } catch (sysError) {
        window.electronAPI.debugLog(`🎤 [START] System audio not available: ${sysError}`)
      }
      
      // Start Web Audio API recording
      await startWebAudioRecording(micStream)
      
      // Set up silence detection
      setupSilenceDetection(micStream)
      
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

  const stopListening = () => {
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
    
    // Reset restart flags
    justRestarted.current = false
    isProcessing.current = false
    
    setIsListening(false)
    setDebugInfo("")
    setRecordingDuration(0)
    
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
        {/* Listen Button */}
        <button
          onClick={handleListenClick}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            isListening 
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
              : 'bg-white/10 text-white/90 hover:bg-white/20'
          }`}
        >
          {isListening ? (
            <>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Listen
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Listen
            </>
          )}
            </button>

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
                  <span className="font-medium text-white/90">Live Conversation</span>
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
                    <strong className={`${isAiThinking ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {isAiThinking ? 'AI Thinking...' : 'AI Response:'}
                    </strong>
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
