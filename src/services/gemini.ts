import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { VirtualAssistantSettings } from '../settings';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface GenerationResult {
    text: string;
    success: boolean;
    error?: string;
}

export class GeminiService {
    private client: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;
    private settings: VirtualAssistantSettings;

    constructor(settings: VirtualAssistantSettings) {
        this.settings = settings;
        this.initializeClient();
    }

    updateSettings(settings: VirtualAssistantSettings): void {
        this.settings = settings;
        this.initializeClient();
    }

    private initializeClient(): void {
        // Try environment variable first, then settings
        const apiKey = this.settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
        
        if (apiKey) {
            this.client = new GoogleGenerativeAI(apiKey);
            this.model = this.client.getGenerativeModel({ 
                model: this.settings.defaultModel 
            });
        } else {
            this.client = null;
            this.model = null;
        }
    }

    isConfigured(): boolean {
        return this.client !== null && this.settings.geminiApiKey !== '';
    }

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        if (!this.isConfigured()) {
            return { 
                success: false, 
                error: 'API key not configured. Please add your Gemini API key in settings.' 
            };
        }

        try {
            const response = await this.generateText('Say "Hello" in one word.');
            if (!response.success) {
                return { 
                    success: false, 
                    error: response.error || 'Unknown error during test' 
                };
            }
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Connection test failed' 
            };
        }
    }

    async generateText(
        prompt: string,
        systemPrompt?: string,
        modelName?: string
    ): Promise<GenerationResult> {
        if (!this.client) {
            return {
                text: '',
                success: false,
                error: 'Gemini API is not configured. Please add your API key in settings.'
            };
        }

        try {
            const model = modelName 
                ? this.client.getGenerativeModel({ model: modelName })
                : this.model!;
            
            const fullPrompt = systemPrompt 
                ? `${systemPrompt}\n\n${prompt}`
                : prompt;

            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            return {
                text,
                success: true
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                text: '',
                success: false,
                error: errorMessage
            };
        }
    }

    async generateWithHistory(
        messages: ChatMessage[],
        newMessage: string,
        systemPrompt?: string,
        context?: string
    ): Promise<GenerationResult> {
        if (!this.client || !this.model) {
            return {
                text: '',
                success: false,
                error: 'Gemini API is not configured. Please add your API key in settings.'
            };
        }

        try {
            // Build the conversation history
            const history: Content[] = messages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

            // Start a chat with history
            const chat = this.model.startChat({
                history,
                generationConfig: {
                    maxOutputTokens: 8192,
                }
            });

            // Build the new message with context
            let fullMessage = '';
            if (systemPrompt) {
                fullMessage += `[System Instructions: ${systemPrompt}]\n\n`;
            }
            if (context) {
                fullMessage += `[Current Note Context:\n${context}]\n\n`;
            }
            fullMessage += newMessage;

            const result = await chat.sendMessage(fullMessage);
            const response = await result.response;

            return {
                text: response.text(),
                success: true
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                text: '',
                success: false,
                error: errorMessage
            };
        }
    }

    async *generateStream(
        prompt: string,
        systemPrompt?: string
    ): AsyncGenerator<string, void, unknown> {
        if (!this.model) {
            throw new Error('Gemini API is not configured');
        }

        try {
            const fullPrompt = systemPrompt 
                ? `${systemPrompt}\n\n${prompt}`
                : prompt;

            const result = await this.model.generateContentStream(fullPrompt);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    yield text;
                }
            }
        } catch (error) {
            throw error;
        }
    }

    async generateTaskFromDescription(description: string): Promise<GenerationResult> {
        const systemPrompt = `You are a task management assistant. Given a task description, extract and organize it into a structured format.

Return a JSON object with the following fields:
- title: string (concise task title)
- description: string (detailed description)
- priority: "high" | "medium" | "low"
- due_date: string (ISO date if mentioned, otherwise empty)
- tags: string[] (relevant tags)
- subtasks: string[] (list of subtasks)
- notes: string (any additional notes)
- related: string[] (related topics or concepts)

Only return valid JSON, no markdown code blocks or other formatting.`;

        return this.generateText(description, systemPrompt);
    }

    async generateCanvasLayout(
        taskDescription: string,
        layoutType: 'taskboard' | 'riskmatrix' | 'personnel' | 'mindmap'
    ): Promise<GenerationResult> {
        const layoutInstructions: Record<string, string> = {
            taskboard: `Create a Kanban-style task board with columns: "To Do", "In Progress", "Review", "Done". 
Position nodes in columns with appropriate spacing.`,
            
            riskmatrix: `Create a 2D risk matrix with:
- X-axis: Likelihood (Low, Medium, High)
- Y-axis: Impact (Low, Medium, High)
Position risk items in the appropriate quadrant.`,
            
            personnel: `Create an organizational chart showing:
- Key personnel involved
- Their roles and responsibilities
- Reporting relationships`,
            
            mindmap: `Create a mind map with:
- Central theme in the middle
- Main branches radiating outward
- Sub-topics as smaller connected nodes`
        };

        const systemPrompt = `You are a canvas layout generator. Create a JSON Canvas layout based on the given description.

Layout Type: ${layoutType}
${layoutInstructions[layoutType]}

Return a valid JSON object following the JSON Canvas spec:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "text" | "group",
      "x": number,
      "y": number,
      "width": number,
      "height": number,
      "text": "content" (for text nodes),
      "label": "label" (for group nodes),
      "color": "1" to "6" (optional color preset)
    }
  ],
  "edges": [
    {
      "id": "unique-id",
      "fromNode": "node-id",
      "toNode": "node-id",
      "fromSide": "top" | "right" | "bottom" | "left",
      "toSide": "top" | "right" | "bottom" | "left",
      "label": "edge label" (optional)
    }
  ]
}

Only return valid JSON, no markdown code blocks.`;

        return this.generateText(taskDescription, systemPrompt);
    }
}
