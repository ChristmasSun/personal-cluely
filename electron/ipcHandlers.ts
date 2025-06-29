// ipcHandlers.ts

import { ipcMain, app, desktopCapturer } from "electron"
import { AppState } from "./main"
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("take-screenshot-and-analyze", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      // Process the screenshot for AI analysis and switch to Solutions view
      await appState.processingHelper.processScreenshots(screenshotPath)
      return { success: true }
    } catch (error) {
      console.error("Error taking screenshot and analyzing:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for conversational audio processing
  ipcMain.handle("analyze-audio-conversational", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processConversationalAudio(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-conversational handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  // IPC handler for asking questions about the current screenshot
  ipcMain.handle("ask-question-about-screenshot", async (event, question: string) => {
    try {
      const result = await appState.processingHelper.askQuestionAboutCurrentScreenshot(question)
      return result
    } catch (error: any) {
      console.error("Error in ask-question-about-screenshot handler:", error)
      throw error
    }
  })

  // IPC handler for getting conversation history
  ipcMain.handle("get-conversation-history", async () => {
    try {
      return appState.processingHelper.getConversationHistory()
    } catch (error: any) {
      console.error("Error in get-conversation-history handler:", error)
      throw error
    }
  })

  // IPC handler for clearing conversation
  ipcMain.handle("clear-conversation", async () => {
    try {
      appState.processingHelper.clearConversation()
      return { success: true }
    } catch (error: any) {
      console.error("Error in clear-conversation handler:", error)
      throw error
    }
  })

  // IPC handler for clearing listen conversation
  ipcMain.handle("clear-listen-conversation", async () => {
    try {
      appState.processingHelper.clearListenConversation()
      return { success: true }
    } catch (error: any) {
      console.error("Error in clear-listen-conversation handler:", error)
      throw error
    }
  })

  // IPC handler for debug logging to terminal
  ipcMain.handle("debug-log", async (event, message: string) => {
    console.log(`[FRONTEND DEBUG] ${message}`)
    return { success: true }
  })

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // IPC handler for getting desktop sources for system audio
  ipcMain.handle("get-desktop-sources", async () => {
    try {
      console.log("[IPC] Getting desktop sources for system audio...")
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        fetchWindowIcons: false
      })
      
      const audioSources = sources.map(source => ({
        id: source.id,
        name: source.name,
        display_id: source.display_id
      }))
      
      console.log("[IPC] Found desktop sources:", audioSources.length)
      return audioSources
    } catch (error: any) {
      console.error("[IPC] Error getting desktop sources:", error)
      throw error
    }
  })

  // Audio device switching handlers
  ipcMain.handle('switch-audio-mode', async (event, mode: 'meeting' | 'normal') => {
    try {
      console.log(`🎧 [IPC] Switching audio to ${mode} mode...`)
      
      const { stdout, stderr } = await execAsync(`./scripts/toggle-audio.sh ${mode}`)
      
      if (stderr) {
        console.warn(`🎧 [IPC] Audio switch warning: ${stderr}`)
      }
      
      console.log(`✅ [IPC] Audio switched to ${mode} mode successfully`)
      console.log(stdout)
      
      return { success: true, output: stdout }
    } catch (error) {
      console.error(`❌ [IPC] Failed to switch audio to ${mode} mode:`, error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  })

  // Auto-toggle audio mode (detects current state and switches)
  ipcMain.handle('toggle-audio-mode', async (event) => {
    try {
      console.log('🎧 [IPC] Auto-toggling audio mode...')
      
      const { stdout, stderr } = await execAsync('./scripts/toggle-audio.sh')
      
      if (stderr) {
        console.warn(`🎧 [IPC] Audio toggle warning: ${stderr}`)
      }
      
      console.log('✅ [IPC] Audio mode toggled successfully')
      console.log(stdout)
      
      return { success: true, output: stdout }
    } catch (error) {
      console.error('❌ [IPC] Failed to toggle audio mode:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  })
}
