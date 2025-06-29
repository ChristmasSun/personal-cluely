"use strict";
// ipcHandlers.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeIpcHandlers = initializeIpcHandlers;
const electron_1 = require("electron");
function initializeIpcHandlers(appState) {
    electron_1.ipcMain.handle("update-content-dimensions", async (event, { width, height }) => {
        if (width && height) {
            appState.setWindowDimensions(width, height);
        }
    });
    electron_1.ipcMain.handle("delete-screenshot", async (event, path) => {
        return appState.deleteScreenshot(path);
    });
    electron_1.ipcMain.handle("take-screenshot", async () => {
        try {
            const screenshotPath = await appState.takeScreenshot();
            const preview = await appState.getImagePreview(screenshotPath);
            return { path: screenshotPath, preview };
        }
        catch (error) {
            console.error("Error taking screenshot:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("take-screenshot-and-analyze", async () => {
        try {
            const screenshotPath = await appState.takeScreenshot();
            // Process the screenshot for AI analysis and switch to Solutions view
            await appState.processingHelper.processScreenshots(screenshotPath);
            return { success: true };
        }
        catch (error) {
            console.error("Error taking screenshot and analyzing:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("get-screenshots", async () => {
        console.log({ view: appState.getView() });
        try {
            let previews = [];
            if (appState.getView() === "queue") {
                previews = await Promise.all(appState.getScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            else {
                previews = await Promise.all(appState.getExtraScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            previews.forEach((preview) => console.log(preview.path));
            return previews;
        }
        catch (error) {
            console.error("Error getting screenshots:", error);
            throw error;
        }
    });
    electron_1.ipcMain.handle("toggle-window", async () => {
        appState.toggleMainWindow();
    });
    electron_1.ipcMain.handle("reset-queues", async () => {
        try {
            appState.clearQueues();
            console.log("Screenshot queues have been cleared.");
            return { success: true };
        }
        catch (error) {
            console.error("Error resetting queues:", error);
            return { success: false, error: error.message };
        }
    });
    // IPC handler for analyzing audio from base64 data
    electron_1.ipcMain.handle("analyze-audio-base64", async (event, data, mimeType) => {
        try {
            const result = await appState.processingHelper.processAudioBase64(data, mimeType);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-base64 handler:", error);
            throw error;
        }
    });
    // IPC handler for conversational audio processing
    electron_1.ipcMain.handle("analyze-audio-conversational", async (event, data, mimeType) => {
        try {
            const result = await appState.processingHelper.processConversationalAudio(data, mimeType);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-conversational handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing audio from file path
    electron_1.ipcMain.handle("analyze-audio-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.processAudioFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-audio-file handler:", error);
            throw error;
        }
    });
    // IPC handler for analyzing image from file path
    electron_1.ipcMain.handle("analyze-image-file", async (event, path) => {
        try {
            const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path);
            return result;
        }
        catch (error) {
            console.error("Error in analyze-image-file handler:", error);
            throw error;
        }
    });
    // IPC handler for asking questions about the current screenshot
    electron_1.ipcMain.handle("ask-question-about-screenshot", async (event, question) => {
        try {
            const result = await appState.processingHelper.askQuestionAboutCurrentScreenshot(question);
            return result;
        }
        catch (error) {
            console.error("Error in ask-question-about-screenshot handler:", error);
            throw error;
        }
    });
    // IPC handler for getting conversation history
    electron_1.ipcMain.handle("get-conversation-history", async () => {
        try {
            return appState.processingHelper.getConversationHistory();
        }
        catch (error) {
            console.error("Error in get-conversation-history handler:", error);
            throw error;
        }
    });
    // IPC handler for clearing conversation
    electron_1.ipcMain.handle("clear-conversation", async () => {
        try {
            appState.processingHelper.clearConversation();
            return { success: true };
        }
        catch (error) {
            console.error("Error in clear-conversation handler:", error);
            throw error;
        }
    });
    // IPC handler for clearing listen conversation
    electron_1.ipcMain.handle("clear-listen-conversation", async () => {
        try {
            appState.processingHelper.clearListenConversation();
            return { success: true };
        }
        catch (error) {
            console.error("Error in clear-listen-conversation handler:", error);
            throw error;
        }
    });
    // IPC handler for debug logging to terminal
    electron_1.ipcMain.handle("debug-log", async (event, message) => {
        console.log(`[FRONTEND DEBUG] ${message}`);
        return { success: true };
    });
    electron_1.ipcMain.handle("quit-app", () => {
        electron_1.app.quit();
    });
    // IPC handler for getting desktop sources for system audio
    electron_1.ipcMain.handle("get-desktop-sources", async () => {
        try {
            console.log("[IPC] Getting desktop sources for system audio...");
            const sources = await electron_1.desktopCapturer.getSources({
                types: ['screen', 'window'],
                fetchWindowIcons: false
            });
            const audioSources = sources.map(source => ({
                id: source.id,
                name: source.name,
                display_id: source.display_id
            }));
            console.log("[IPC] Found desktop sources:", audioSources.length);
            return audioSources;
        }
        catch (error) {
            console.error("[IPC] Error getting desktop sources:", error);
            throw error;
        }
    });
}
//# sourceMappingURL=ipcHandlers.js.map