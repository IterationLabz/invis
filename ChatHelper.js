// ChatHelper.js - Chat memory management
// Server-side chat memory management

const { app } = require('electron');
const { loadSecureConfig } = require('./secure-storage');

// We'll load the config when needed instead of using a store directly
let cachedConfig = null;

async function getConfig() {
    if (!cachedConfig) {
        cachedConfig = await loadSecureConfig(app);
    }
    return cachedConfig;
}

class ChatHelper {
    constructor() {
        this.conversationHistory = [];
        this.maxHistoryLength = 50; // Store last 50 messages
        // Write your own prompt in system-prompt.local.md (see README).
        this.systemPrompt = require('./shared/prompt').readPrompt();
        this.config = null;
    }

    setConfig(config) {
        this.config = config;
        // Load custom system prompt if available
        if (config && config.customSystemPrompt) {
            this.systemPrompt = config.customSystemPrompt;
            console.log('Using custom system prompt from config');
        }
    }

    reloadSystemPrompt() {
        if (this.config && this.config.customSystemPrompt) {
            this.systemPrompt = this.config.customSystemPrompt;
        }
        console.log('System prompt reloaded');
    }

    addMessage(role, content) {
        const message = {
            role,
            content,
            timestamp: Date.now()
        };

        this.conversationHistory.push(message);

        // Trim history if it exceeds max length
        if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
        }

        return message;
    }

    getHistory() {
        return [...this.conversationHistory];
    }

    getFormattedHistoryForOpenAI() {
        const messages = [];

        // Add system prompt
        messages.push({
            role: 'system',
            content: this.systemPrompt
        });

        // Add conversation history
        for (const msg of this.conversationHistory) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }

        return messages;
    }

    getFormattedHistoryForGemini() {
        const contents = [];

        // Note: Gemini doesn't have a "system" role in the same way
        // We can prepend the system prompt to the first user message or use a different approach

        for (const msg of this.conversationHistory) {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }

        return contents;
    }

    getFormattedHistoryForAnthropic() {
        const messages = [];

        for (const msg of this.conversationHistory) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }

        return messages;
    }

    async sendMessage(message, provider = 'openai', apiKey = null, model = null) {
        // Add user message to history
        this.addMessage('user', message);

        try {
            let response;

            // Get AI settings if not provided
            if (!apiKey && this.config) {
                const aiProvider = this.config.aiProvider || 'openai';
                provider = aiProvider;

                if (provider === 'openai') {
                    apiKey = this.config.openaiApiKey;
                } else if (provider === 'google') {
                    apiKey = this.config.geminiApiKey;
                }
            }

            if (!apiKey) {
                throw new Error('No API key configured. Please set your API key in settings.');
            }

            switch (provider) {
                case 'openai':
                    response = await this.sendToOpenAI(message, apiKey, model);
                    break;
                case 'google':
                    response = await this.sendToGemini(message, apiKey, model);
                    break;
                case 'anthropic':
                    response = await this.sendToAnthropic(message, apiKey, model);
                    break;
                default:
                    throw new Error(`Unsupported provider: ${provider}`);
            }

            // Add assistant response to history
            this.addMessage('assistant', response.text);

            return response;
        } catch (error) {
            console.error('ChatHelper error:', error);
            throw error;
        }
    }

    async sendToOpenAI(message, apiKey, model = 'gpt-4o-mini') {
        const messages = this.getFormattedHistoryForOpenAI();

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o-mini',
                messages: messages,
                max_tokens: 4096,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API error');
        }

        const data = await response.json();
        return { text: data.choices[0].message.content };
    }

    async sendToGemini(message, apiKey, model = 'gemini-1.5-flash') {
        const contents = this.getFormattedHistoryForGemini();

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        maxOutputTokens: 4096,
                        temperature: 0.7
                    },
                    systemInstruction: {
                        parts: [{ text: this.systemPrompt }]
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        return { text: data.candidates[0].content.parts[0].text };
    }

    async sendToAnthropic(message, apiKey, model = 'claude-3-5-sonnet-20241022') {
        const messages = this.getFormattedHistoryForAnthropic();

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model || 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
                system: this.systemPrompt,
                messages: messages
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Anthropic API error');
        }

        const data = await response.json();
        return { text: data.content[0].text };
    }

    clearHistory() {
        this.conversationHistory = [];
        console.log('Chat history cleared');
    }

    getHistoryLength() {
        return this.conversationHistory.length;
    }

    setMaxHistoryLength(length) {
        this.maxHistoryLength = length;
        // Trim if necessary
        if (this.conversationHistory.length > length) {
            this.conversationHistory = this.conversationHistory.slice(-length);
        }
    }

    exportHistory() {
        return {
            systemPrompt: this.systemPrompt,
            history: this.conversationHistory,
            exportedAt: Date.now()
        };
    }

    importHistory(data) {
        if (data.history && Array.isArray(data.history)) {
            this.conversationHistory = data.history;
            console.log(`Imported ${data.history.length} messages`);
        }
        if (data.systemPrompt) {
            this.systemPrompt = data.systemPrompt;
        }
    }
}

module.exports = { ChatHelper };
