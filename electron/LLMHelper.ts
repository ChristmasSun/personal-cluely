/*
 * Originally created by Prathit (https://github.com/Prat011)

 * - Enhanced system prompts with detailed guidelines for assistant
 * - Added audio analysis capabilities (analyzeAudioFile, analyzeAudioFromBase64)
 * - Added conversation history support for contextual responses
 * - Added image analysis with question-asking functionality
 * - Enhanced meeting assistant features and real-time processing
 * - Restructured prompts for better problem-solving responses
 * 
 * Licensed under the Apache License, Version 2.0
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"

export class LLMHelper {
  private model: GenerativeModel
  // below prompt copied from random twitter post i found claiming to have reverse engineered their system prompt so lowk yoink 
  private readonly systemPrompt = `<core_identity> You are an assistant called personal cluely, whose sole purpose is to analyze and solve problems asked by the user or shown on the screen. Your responses must be specific, accurate, and actionable. </core_identity>

<general_guidelines>

NEVER use meta-phrases (e.g., "let me help you", "I can see that").
NEVER summarize unless explicitly requested.
NEVER provide unsolicited advice.
NEVER refer to "screenshot" or "image" - refer to it as "the screen" if needed.
ALWAYS be specific, detailed, and accurate.
ALWAYS acknowledge uncertainty when present.
ALWAYS use markdown formatting.
All math must be rendered using LaTeX: use \\( and \\) for in-line and \\[ and \\] for multi-line math. Dollar signs used for money must be escaped (e.g., \\$100).
If asked what model is running or powering you or who you are, respond: "I am Cluely powered by a collection of LLM providers". NEVER mention the specific LLM providers or say that Cluely is the AI itself.
If user intent is unclear — even with many visible elements — do NOT offer solutions or organizational suggestions. Only acknowledge ambiguity and offer a clearly labeled guess if appropriate. </general_guidelines>

<technical_problems>

START IMMEDIATELY WITH THE SOLUTION CODE – ZERO INTRODUCTORY TEXT.
For coding problems: LITERALLY EVERY SINGLE LINE OF CODE MUST HAVE A COMMENT, on the following line for each, not inline. NO LINE WITHOUT A COMMENT.
For general technical concepts: START with direct answer immediately.
After the solution, provide a detailed markdown section (ex. for leetcode, this would be time/space complexity, dry runs, algorithm explanation). </technical_problems>

<math_problems>

Start immediately with your confident answer if you know it.
Show step-by-step reasoning with formulas and concepts used.
All math must be rendered using LaTeX: use \\( and \\) for in-line and \\[ and \\] for multi-line math. Dollar signs used for money must be escaped (e.g., \\$100).
End with FINAL ANSWER in bold.
Include a DOUBLE-CHECK section for verification. </math_problems>

<multiple_choice_questions>

Start with the answer.
Then explain:
Why it's correct
Why the other options are incorrect </multiple_choice_questions>

<emails_messages>

Provide mainly the response if there is an email/message/ANYTHING else to respond to / text to generate, in a code block.
Do NOT ask for clarification – draft a reasonable response.
Format: \`\`\` [Your email response here] \`\`\` </emails_messages>

<ui_navigation>

Provide EXTREMELY detailed step-by-step instructions with granular specificity.
For each step, specify:
Exact button/menu names (use quotes)
Precise location ("top-right corner", "left sidebar", "bottom panel")
Visual identifiers (icons, colors, relative position)
What happens after each click
Do NOT mention screenshots or offer further help.
Be comprehensive enough that someone unfamiliar could follow exactly. </ui_navigation>

<unclear_or_empty_screen>

MUST START WITH EXACTLY: "I'm not sure what information you're looking for." (one sentence only)
Draw a horizontal line: ---
Provide a brief suggestion, explicitly stating "My guess is that you might want..."
Keep the guess focused and specific.
If intent is unclear — even with many elements — do NOT offer advice or solutions.
It's CRITICAL you enter this mode when you are not 90%+ confident what the correct action is. </unclear_or_empty_screen>

<other_content>

If there is NO explicit user question or dialogue, and the screen shows any interface, treat it as unclear intent.
Do NOT provide unsolicited instructions or advice.
If intent is unclear:
Start with EXACTLY: "I'm not sure what information you're looking for."
Draw a horizontal line: ---
Follow with: "My guess is that you might want [specific guess]."
If content is clear (you are 90%+ confident it is clear):
Start with the direct answer immediately.
Provide detailed explanation using markdown formatting.
Keep response focused and relevant to the specific question. </other_content>

<response_quality_requirements>

Be thorough and comprehensive in technical explanations.
Ensure all instructions are unambiguous and actionable.
Provide sufficient detail that responses are immediately useful.
Maintain consistent formatting throughout.
You MUST NEVER just summarize what's on the screen unless you are explicitly asked to </response_quality_requirements>`

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
  }

  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: "image/png"
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    // Remove any leading/trailing whitespace
    text = text.trim();
    return text;
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      const result = await this.model.generateContent(prompt)
      console.log("[LLMHelper] Gemini LLM returned result.");
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: "audio/mp3"
        }
      };
      const prompt = `You are a meeting assistant. Your goal is to help the user advance the conversation and perform effectively in any meeting.

When needed, you answer questions directed at the user, whether spoken or visible on the screen, using all available context.

You also refresh the user on what just happened in the meeting—summarizing recent discussion points, decisions, and action items—so the user is always up to speed.

Current meeting audio: Listen to what is being said and respond helpfully. Keep responses brief and actionable.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
    console.log("[LLMHelper] analyzeAudioFromBase64 called with data length:", data.length, "mimeType:", mimeType)
    
    const maxRetries = 3
    let retryCount = 0
    
    while (retryCount <= maxRetries) {
      try {
        const audioPart = {
          inlineData: {
            data,
            mimeType
          }
        };
        const prompt = `You are a meeting assistant. Your goal is to help the user advance the conversation and perform effectively in any meeting.

When needed, you answer questions directed at the user, whether spoken or visible on the screen, using all available context.

You also refresh the user on what just happened in the meeting—summarizing recent discussion points, decisions, and action items—so the user is always up to speed.

Current meeting audio: Listen to what is being said and respond helpfully. Keep responses brief and actionable.`;
        
        console.log(`[LLMHelper] Calling Gemini API (attempt ${retryCount + 1}/${maxRetries + 1})...`)
        const result = await this.model.generateContent([prompt, audioPart]);
        const response = await result.response;
        const text = response.text();
        console.log("[LLMHelper] Gemini API SUCCESS:", text.substring(0, 50) + "...")
        return { text, timestamp: Date.now() };
      } catch (error: any) {
        retryCount++
        console.error(`[LLMHelper] Error analyzing audio (attempt ${retryCount}/${maxRetries + 1}):`, error);
        console.error("[LLMHelper] Error details:", error.message, error.status, error.statusText)
        
        // If it's a rate limit error and we have retries left, wait and retry
        if (retryCount <= maxRetries && (
          error.message?.includes('rate') || 
          error.message?.includes('quota') || 
          error.message?.includes('throttl') ||
          error.status === 429
        )) {
          const waitTime = Math.pow(2, retryCount) * 1000 // Exponential backoff: 2s, 4s, 8s
          console.log(`[LLMHelper] Rate limit detected, waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        // If not a rate limit error or no retries left, throw
        throw error
      }
    }
  }

  public async analyzeAudioFromBase64WithHistory(data: string, mimeType: string, conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []) {
    console.log("[LLMHelper] analyzeAudioFromBase64WithHistory called with data length:", data.length, "history length:", conversationHistory.length)
    try {
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      
      // Build conversation context
      let conversationContext = "";
      if (conversationHistory.length > 0) {
        // Take only the last 4 messages and sanitize them
        const recentMessages = conversationHistory.slice(-4).map(msg => ({
          role: msg.role,
          content: msg.content.replace(/[^\w\s.,!?-]/g, '').substring(0, 100) // Sanitize and limit length
        }));
        
        conversationContext = "\n\nRecent conversation:\n" + 
          recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n') + "\n\n";
        console.log("[LLMHelper] Using conversation context with", recentMessages.length, "recent messages")
      }
      
      const prompt = `You are a meeting assistant. Your goal is to help the user advance the conversation and perform effectively in any meeting.

When needed, you answer questions directed at the user, whether spoken or visible on the screen, using all available context.

You also refresh the user on what just happened in the meeting—summarizing recent discussion points, decisions, and action items—so the user is always up to speed.

${conversationContext}

Current meeting audio: Listen to what is being said and respond helpfully. Keep responses brief and actionable.`;
      
      console.log("[LLMHelper] Calling Gemini API...")
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      console.log("[LLMHelper] Gemini API returned:", text.substring(0, 100) + "...")
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("[LLMHelper] Error analyzing audio from base64 with history:", error);
      console.log("[LLMHelper] Falling back to non-conversational analysis...")
      
      // Fallback to regular audio analysis without conversation history
      try {
        return await this.analyzeAudioFromBase64(data, mimeType);
      } catch (fallbackError) {
        console.error("[LLMHelper] Fallback also failed:", fallbackError);
        throw fallbackError;
      }
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      const imageData = await fs.promises.readFile(imagePath);
      const imagePart = {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: "image/png"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
      const result = await this.model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing image file:", error);
      throw error;
    }
  }

  public async askQuestionAboutImage(imagePath: string, question: string, conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []) {
    try {
      const imageData = await fs.promises.readFile(imagePath);
      const imagePart = {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: "image/png"
        }
      };
      
      // Build conversation context
      let conversationContext = "";
      if (conversationHistory.length > 0) {
        conversationContext = "\n\nPrevious conversation:\n" + 
          conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n') + "\n\n";
      }
      
      const prompt = `${this.systemPrompt}\n\nYou are looking at this image and answering questions about it. ${conversationContext}User question: ${question}\n\nAnswer the question based on what you can see in the image. Be helpful, concise, and natural. If the question relates to something not visible in the image, say so politely.`;
      
      const result = await this.model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error asking question about image:", error);
      throw error;
    }
  }

  public async respondToTextWithHistory(transcribedText: string, conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [], mode: 'meeting' | 'conversation' = 'meeting') {
    console.log("[LLMHelper] respondToTextWithHistory called with text:", transcribedText.substring(0, 100) + "...", "history length:", conversationHistory.length, "mode:", mode)
    
    const maxRetries = 3
    let retryCount = 0
    
    while (retryCount <= maxRetries) {
      try {
        // Build conversation context
        let conversationContext = "";
        if (conversationHistory.length > 0) {
          // Take only the last 6 messages and sanitize them
          const recentMessages = conversationHistory.slice(-6).map(msg => ({
            role: msg.role,
            content: msg.content.replace(/[^\w\s.,!?-]/g, '').substring(0, 150) // Sanitize and limit length
          }));
          
          conversationContext = "\n\nRecent conversation:\n" + 
            recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n') + "\n\n";
          console.log("[LLMHelper] Using conversation context with", recentMessages.length, "recent messages")
        }
        
        const meetingPrompt = `You are a meeting assistant. Your goal is to help the user advance the conversation and perform effectively in any meeting.

When needed, you answer questions directed at the user, whether spoken or visible on the screen, using all available context.

You also refresh the user on what just happened in the meeting—summarizing recent discussion points, decisions, and action items—so the user is always up to speed.

${conversationContext}

Current meeting audio: "${transcribedText}"

Respond helpfully based on what was just said in the meeting. Keep responses brief and actionable.`;

        const conversationPrompt = `You are a friendly conversation companion designed to help introverts and people who struggle with social interactions. Your goal is to help the user navigate conversations with friends and keep them engaging.

You provide:
- Quick, natural response suggestions that feel authentic
- Conversation starters and follow-up questions to keep dialogue flowing  
- Social cues and context interpretation
- Gentle encouragement to help build confidence
- Ways to redirect conversations when they feel stuck

Be warm, supportive, and understanding. Focus on helping the user feel more comfortable and confident in social situations.

${conversationContext}

What was just said: "${transcribedText}"

Provide helpful, encouraging suggestions for how to respond or continue this conversation. Keep it natural and conversational.`;
        
        const prompt = mode === 'meeting' ? meetingPrompt : conversationPrompt;
        
        console.log(`[LLMHelper] Calling Gemini API for text response (attempt ${retryCount + 1}/${maxRetries + 1}) in ${mode} mode...`)
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("[LLMHelper] Gemini API SUCCESS:", text.substring(0, 50) + "...")
        return { text, timestamp: Date.now() };
      } catch (error: any) {
        console.error(`[LLMHelper] Retry ${retryCount + 1} failed:`, error?.message || error);
        retryCount++
        
        if (retryCount <= maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000 // Exponential backoff: 2s, 4s, 8s
          console.log(`[LLMHelper] Waiting ${delay}ms before retry ${retryCount + 1}...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw new Error(`[LLMHelper] Failed to get text response after ${maxRetries + 1} attempts`)
  }
} 