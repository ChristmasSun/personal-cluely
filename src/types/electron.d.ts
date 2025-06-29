export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  takeScreenshotAndAnalyze: () => Promise<void>
  onScreenshotReadyForChat: (callback: (data: { screenshotPath: string; message: string }) => void) => () => void
  askQuestionAboutScreenshot: (question: string) => Promise<{ text: string; timestamp: number }>
  getConversationHistory: () => Promise<Array<{role: 'user' | 'assistant', content: string}>>
  clearConversation: () => Promise<{ success: boolean }>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioConversational: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<void>
  getDesktopSources: () => Promise<any>
  clearListenConversation: () => Promise<{ success: boolean }>
  onToggleListenMode: (callback: () => void) => () => void
  debugLog: (message: string) => Promise<{ success: boolean }>
  quitApp: () => Promise<void>
  
  // Audio device switching
  switchAudioMode: (mode: 'meeting' | 'normal') => Promise<{ success: boolean; output?: string; error?: string }>
  toggleAudioMode: () => Promise<{ success: boolean; output?: string; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 