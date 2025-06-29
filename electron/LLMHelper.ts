import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"

export class LLMHelper {
  private model: GenerativeModel
  private readonly systemPrompt = `You are Wingman AI, a helpful, proactive assistant for any kind of problem or situation (not just coding). For any user input, analyze the situation, provide a clear problem statement, relevant context, and suggest several possible responses or actions the user could take next. Always explain your reasoning. Present your suggestions as a list of options or next steps.`

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
      const prompt = `You are a helpful AI assistant having a real-time conversation. Listen to what the user is saying and respond naturally as if you're talking with them. 

Rules:
- Respond directly to what they said, like a friend would
- If they ask a question, answer it helpfully
- If they make a statement, acknowledge it and add something useful
- If they seem confused or stuck, offer specific help
- Keep responses conversational and under 2-3 sentences
- Be encouraging and supportive
- If they're in a meeting/call, you can comment on what you hear

Respond as if you're their AI companion who's listening and wants to help.`;
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
        const prompt = `You are a helpful AI assistant having a real-time conversation. Listen to what the user is saying and respond naturally as if you're talking with them. 

Rules:
- Respond directly to what they said, like a friend would
- If they ask a question, answer it helpfully
- If they make a statement, acknowledge it and add something useful
- If they seem confused or stuck, offer specific help
- Keep responses conversational and under 2-3 sentences
- Be encouraging and supportive
- If they're in a meeting/call, you can comment on what you hear

Respond as if you're their AI companion who's listening and wants to help.`;
        
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
      
      const prompt = `You are a helpful AI assistant having a real-time conversation. Listen to what the user is saying and respond naturally as if you're talking with them. ${conversationContext}

Rules:
- Respond directly to what they said, like a friend would
- If they ask a question, answer it helpfully
- If they make a statement, acknowledge it and add something useful
- If they seem confused or stuck, offer specific help
- Keep responses conversational and under 2-3 sentences
- Be encouraging and supportive
- If they're in a meeting/call, you can comment on what you hear
- Reference previous parts of the conversation when relevant

Current audio: Listen to what the user just said and respond naturally.`;
      
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

  public async respondToTextWithHistory(transcribedText: string, conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = []) {
    console.log("[LLMHelper] respondToTextWithHistory called with text:", transcribedText.substring(0, 100) + "...", "history length:", conversationHistory.length)
    
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
        
        const prompt = `You are a helpful AI assistant having a real-time conversation. The user just said: "${transcribedText}" ${conversationContext}

Rules:
- Respond directly to what they said, like a friend would
- If they ask a question, answer it helpfully
- If they make a statement, acknowledge it and add something useful
- If they seem confused or stuck, offer specific help
- Keep responses conversational and under 2-3 sentences
- Be encouraging and supportive
- If they're in a meeting/call, you can comment on what you hear
- Reference previous parts of the conversation when relevant

Current message: Respond naturally to what the user just said: "${transcribedText}"`;
        
        console.log(`[LLMHelper] Calling Gemini API for text response (attempt ${retryCount + 1}/${maxRetries + 1})...`)
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("[LLMHelper] Gemini text response SUCCESS:", text.substring(0, 50) + "...")
        return { text, timestamp: Date.now() };
      } catch (error: any) {
        retryCount++
        console.error(`[LLMHelper] Error responding to text (attempt ${retryCount}/${maxRetries + 1}):`, error);
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
} 