// ProcessingHelper.ts

import { AppState } from "./main"
import { LLMHelper } from "./LLMHelper"
import { DeepgramHelper } from "./DeepgramHelper"
import dotenv from "dotenv"

dotenv.config()

const isDev = process.env.NODE_ENV === "development"
const isDevTest = process.env.IS_DEV_TEST === "true"
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500

export class ProcessingHelper {
  private appState: AppState
  private llmHelper: LLMHelper
  private deepgramHelper: DeepgramHelper
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null
  private currentScreenshotPath: string | null = null
  private conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []
  private listenConversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []

  constructor(appState: AppState) {
    this.appState = appState
    
    // Initialize Gemini API
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not found in environment variables")
    }
    this.llmHelper = new LLMHelper(geminiApiKey)
    
    // Initialize Deepgram API
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY
    if (!deepgramApiKey) {
      throw new Error("DEEPGRAM_API_KEY not found in environment variables")
    }
    this.deepgramHelper = new DeepgramHelper(deepgramApiKey)
  }

  public async processScreenshots(specificScreenshotPath?: string): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    // If a specific screenshot path is provided, use that (for Cmd+Enter workflow)
    if (specificScreenshotPath) {
      // Check if it's an audio file
      if (specificScreenshotPath.endsWith('.mp3') || specificScreenshotPath.endsWith('.wav')) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView('solutions');
        try {
          const audioResult = await this.llmHelper.analyzeAudioFile(specificScreenshotPath);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, audioResult);
          this.appState.setProblemInfo({ problem_statement: audioResult.text, input_format: {}, output_format: {}, constraints: [], test_cases: [] });
          return;
        } catch (err: any) {
          console.error('Audio processing error:', err);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, err.message);
          return;
        }
      }

      // Handle screenshot for interactive chat
      console.log("Processing specific screenshot:", specificScreenshotPath)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")
      
      // Store the screenshot path for interactive queries
      this.currentScreenshotPath = specificScreenshotPath
      this.conversationHistory = [] // Reset conversation for new screenshot
      
      // Send event to indicate we're ready for chat instead of extracting description
      mainWindow.webContents.send("screenshot-ready-for-chat", { 
        screenshotPath: specificScreenshotPath,
        message: "Screenshot captured! Ask me anything about what's on your screen."
      });
      return;
    }

    // Fallback: Always check for new screenshots first (for old workflow)
    const screenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
    if (screenshotQueue.length > 0) {
      // Check if last screenshot is an audio file
      const allPaths = this.appState.getScreenshotHelper().getScreenshotQueue();
      const lastPath = allPaths[allPaths.length - 1];
      if (lastPath.endsWith('.mp3') || lastPath.endsWith('.wav')) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView('solutions');
        try {
          const audioResult = await this.llmHelper.analyzeAudioFile(lastPath);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, audioResult);
          this.appState.setProblemInfo({ problem_statement: audioResult.text, input_format: {}, output_format: {}, constraints: [], test_cases: [] });
          return;
        } catch (err: any) {
          console.error('Audio processing error:', err);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, err.message);
          return;
        }
      }

      // Handle screenshot for interactive chat
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")
      
      // Store the screenshot path for interactive queries
      this.currentScreenshotPath = lastPath
      this.conversationHistory = [] // Reset conversation for new screenshot
      
      // Send event to indicate we're ready for chat instead of extracting description
      mainWindow.webContents.send("screenshot-ready-for-chat", { 
        screenshotPath: lastPath,
        message: "Screenshot captured! Ask me anything about what's on your screen."
      });
      return;
    }

    // If no new screenshots, check for debug mode (only when explicitly in debug view)
    const view = this.appState.getView()
    if (view === "solutions") {
      // Debug mode - only if we have extra screenshots
      const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No screenshots to process")
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)
      this.currentExtraProcessingAbortController = new AbortController()

      try {
        // Get problem info and current solution
        const problemInfo = this.appState.getProblemInfo()
        if (!problemInfo) {
          throw new Error("No problem info available")
        }

        // Get current solution from state
        const currentSolution = await this.llmHelper.generateSolution(problemInfo)
        const currentCode = currentSolution.solution.code

        // Debug the solution using vision model
        const debugResult = await this.llmHelper.debugSolutionWithImages(
          problemInfo,
          currentCode,
          extraScreenshotQueue
        )

        this.appState.setHasDebugged(true)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
          debugResult
        )

      } catch (error: any) {
        console.error("Debug processing error:", error)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
          error.message
        )
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    } else {
      // No screenshots available at all
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }

    // Clear conversation when canceling requests
    this.clearConversation()
    
    this.appState.setHasDebugged(false)
  }

  public async processAudioBase64(data: string, mimeType: string) {
    // Directly use LLMHelper to analyze inline base64 audio
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType);
  }

  // New method for conversational audio processing using Deepgram + Gemini
  public async processConversationalAudio(data: string, mimeType: string) {
    console.log("[ProcessingHelper] processConversationalAudio called with data length:", data.length, "mimeType:", mimeType)
    try {
      // Step 1: Transcribe audio using Deepgram
      console.log("[ProcessingHelper] Step 1: Transcribing audio with Deepgram...")
      const transcribedText = await this.deepgramHelper.transcribeAudioFromBase64(data, mimeType);
      
      if (!transcribedText.trim()) {
        console.log("[ProcessingHelper] Empty transcription, likely silence")
        return { text: "", timestamp: Date.now() };
      }
      
      console.log("[ProcessingHelper] Transcription:", transcribedText)
      
      // Step 2: Generate conversational response using Gemini
      console.log("[ProcessingHelper] Step 2: Generating response with Gemini, conversation history length:", this.listenConversationHistory.length)
      const result = await this.llmHelper.respondToTextWithHistory(transcribedText, this.listenConversationHistory);
      
      console.log("[ProcessingHelper] Gemini returned result:", result.text.substring(0, 50) + "...")
      
      // Step 3: Update conversation history with actual transcribed text
      this.listenConversationHistory.push({ role: 'user', content: transcribedText });
      this.listenConversationHistory.push({ role: 'assistant', content: result.text });
      
      // Keep conversation history manageable (last 12 exchanges = 24 entries)
      if (this.listenConversationHistory.length > 24) {
        this.listenConversationHistory = this.listenConversationHistory.slice(-24);
      }
      
      console.log("[ProcessingHelper] Updated conversation history, total entries:", this.listenConversationHistory.length)
      return result;
    } catch (error) {
      console.error("[ProcessingHelper] Error in conversational audio processing:", error);
      throw error;
    }
  }

  // Add audio file processing method
  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath);
  }

  public async askQuestionAboutCurrentScreenshot(question: string): Promise<{ text: string; timestamp: number }> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) throw new Error("No main window available")
    
    if (!this.currentScreenshotPath) {
      throw new Error("No screenshot available for questions")
    }

    try {
      // Add user question to conversation history
      this.conversationHistory.push({ role: 'user', content: question })
      
      // Get AI response
      const response = await this.llmHelper.askQuestionAboutImage(
        this.currentScreenshotPath, 
        question, 
        this.conversationHistory
      )
      
      // Add AI response to conversation history
      this.conversationHistory.push({ role: 'assistant', content: response.text })
      
      return response
    } catch (error: any) {
      console.error("Error asking question about screenshot:", error)
      throw error
    }
  }

  public getCurrentScreenshotPath(): string | null {
    return this.currentScreenshotPath
  }

  public getConversationHistory(): Array<{role: 'user' | 'assistant', content: string}> {
    return this.conversationHistory
  }

  public clearConversation(): void {
    this.conversationHistory = []
    this.currentScreenshotPath = null
  }

  public clearListenConversation(): void {
    this.listenConversationHistory = []
  }

  public getLLMHelper() {
    return this.llmHelper;
  }
}
