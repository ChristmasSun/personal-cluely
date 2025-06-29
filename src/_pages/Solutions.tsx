// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"

// Export components for Debug.tsx to use
export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Loading...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-gray-100 max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      Complexity
    </h2>
    {isLoading ? (
      <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
        Calculating complexity...
      </p>
    ) : (
      <div className="space-y-1">
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Time:</strong> {timeComplexity}
          </div>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-[1.4] text-gray-100">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <strong>Space:</strong> {spaceComplexity}
          </div>
        </div>
      </div>
    )}
  </div>
)

interface SolutionsProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const Solutions: React.FC<SolutionsProps> = ({ setView }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })
  
  const contentRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const showToast = (title: string, description: string, variant: ToastVariant) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Aggressive auto-focus with multiple attempts
    const focusInput = () => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select() // Also select any existing text
      }
    }

    // Try multiple times with different delays
    setTimeout(focusInput, 50)
    setTimeout(focusInput, 150)
    setTimeout(focusInput, 300)
    setTimeout(focusInput, 500)

    // Listen for screenshot ready event
    const cleanupScreenshotReady = window.electronAPI.onScreenshotReadyForChat((data) => {
      setMessages([{
        role: 'assistant',
        content: data.message,
        timestamp: Date.now()
      }])
      // Aggressive focus after screenshot ready
      setTimeout(focusInput, 100)
      setTimeout(focusInput, 250)
      setTimeout(focusInput, 400)
    })

    return () => {
      resizeObserver.disconnect()
      cleanupScreenshotReady()
    }
  }, [])

  // Additional useEffect to handle global focus and keyboard events
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If user starts typing and input isn't focused, focus it
      if (!isLoading && e.key.length === 1 && inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus()
        // Don't prevent default - let the character be typed
      }
    }

    const handleGlobalClick = (e: MouseEvent) => {
      // Focus input on any click in the window (unless clicking on buttons)
      if (!isLoading && inputRef.current && !(e.target as HTMLElement)?.closest('button')) {
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus()
          }
        }, 10)
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    document.addEventListener('click', handleGlobalClick)

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown)
      document.removeEventListener('click', handleGlobalClick)
    }
  }, [isLoading])

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage("")
    setIsLoading(true)

    try {
      const response = await window.electronAPI.askQuestionAboutScreenshot(userMessage.content)
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
        timestamp: response.timestamp
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error: any) {
      console.error("Error asking question:", error)
      showToast("Error", "Failed to get response. Please try again.", "error")
    } finally {
      setIsLoading(false)
      // Re-focus input after response
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 100)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const clearChat = async () => {
    try {
      await window.electronAPI.clearConversation()
      setMessages([])
      showToast("Chat Cleared", "Conversation history has been cleared.", "neutral")
      // Re-focus input after clearing chat
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 100)
    } catch (error) {
      console.error("Error clearing conversation:", error)
      showToast("Error", "Failed to clear conversation.", "error")
    }
  }

  return (
    <div ref={contentRef} className="bg-transparent">
      <div className="px-4 py-3 max-w-2xl">
        <Toast
          open={toastOpen}
          onOpenChange={setToastOpen}
          variant={toastMessage.variant}
          duration={3000}
        >
          <ToastTitle>{toastMessage.title}</ToastTitle>
          <ToastDescription>{toastMessage.description}</ToastDescription>
        </Toast>

        {/* Chat header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white/90">Ask about your screen</h2>
          <div className="flex gap-2">
            <button
              onClick={clearChat}
              className="text-xs bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-2 py-1 text-white/70"
            >
              Clear Chat
            </button>
            <button
              onClick={() => setView("queue")}
              className="text-xs bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-2 py-1 text-white/70"
            >
              Back
            </button>
          </div>
        </div>

        {/* Chat messages */}
        <div className="bg-black/60 backdrop-blur-md rounded-xl p-4 mb-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center text-white/50 py-8">
              <p>Ask me anything about what's on your screen!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10 text-white/90'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/10 text-white/70 rounded-xl px-3 py-2 text-sm">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your screen..."
            className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-colors"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-white/10 disabled:text-white/30 transition-colors rounded-xl px-4 py-2 text-white text-sm font-medium"
          >
            Send
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="mt-2 text-xs text-white/50 text-center">
          Press <kbd className="bg-white/10 px-1 rounded">⌘+R</kbd> to reset • <kbd className="bg-white/10 px-1 rounded">Enter</kbd> to send
        </div>
      </div>
    </div>
  )
}

export default Solutions
