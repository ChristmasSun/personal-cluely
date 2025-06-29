"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramHelper = void 0;
const sdk_1 = require("@deepgram/sdk");
class DeepgramHelper {
    deepgram;
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error("DEEPGRAM_API_KEY not found in environment variables");
        }
        this.deepgram = (0, sdk_1.createClient)(apiKey);
    }
    async transcribeAudioFromBase64(data, mimeType) {
        try {
            console.log("[DeepgramHelper] Starting transcription for audio data length:", data.length, "mimeType:", mimeType);
            // Convert base64 to buffer
            const audioBuffer = Buffer.from(data, 'base64');
            // Use simple configuration
            const options = {
                model: 'nova-2',
                language: 'en-US',
                smart_format: true,
                punctuate: true
            };
            console.log("[DeepgramHelper] Calling Deepgram prerecorded API...");
            // Use the correct method: transcribeUrl for URLs, transcribeFile for files, or pass buffer directly
            const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(audioBuffer, options);
            if (error) {
                console.error("[DeepgramHelper] Deepgram API error:", error);
                throw new Error(`Deepgram transcription failed: ${error}`);
            }
            // Extract transcript text
            const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
            console.log("[DeepgramHelper] Transcription successful:", transcript.substring(0, 100) + "...");
            if (!transcript.trim()) {
                console.log("[DeepgramHelper] Empty transcript, likely silence or unclear audio");
                return '';
            }
            return transcript;
        }
        catch (error) {
            console.error("[DeepgramHelper] Error transcribing audio:", error);
            throw new Error(`Deepgram transcription failed: ${error.message}`);
        }
    }
    async transcribeAudioFile(filePath) {
        try {
            console.log("[DeepgramHelper] Transcribing audio file:", filePath);
            const options = {
                model: 'nova-2',
                language: 'en-US',
                smart_format: true,
                punctuate: true
            };
            const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(filePath, options);
            if (error) {
                console.error("[DeepgramHelper] Deepgram API error:", error);
                throw new Error(`Deepgram transcription failed: ${error}`);
            }
            const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
            console.log("[DeepgramHelper] File transcription successful:", transcript.substring(0, 100) + "...");
            return transcript;
        }
        catch (error) {
            console.error("[DeepgramHelper] Error transcribing audio file:", error);
            throw new Error(`Deepgram transcription failed: ${error.message}`);
        }
    }
}
exports.DeepgramHelper = DeepgramHelper;
//# sourceMappingURL=DeepgramHelper.js.map