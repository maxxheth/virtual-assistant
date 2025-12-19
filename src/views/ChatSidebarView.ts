import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, Notice } from 'obsidian';
import VirtualAssistantPlugin from '../main';
import { ChatMessage } from '../services/gemini';

export const CHAT_VIEW_TYPE = 'virtual-assistant-chat';

export class ChatSidebarView extends ItemView {
    plugin: VirtualAssistantPlugin;
    private messagesContainer!: HTMLElement;
    private inputField!: HTMLTextAreaElement;
    private sendButton!: HTMLButtonElement;
    private chatHistory: ChatMessage[] = [];
    private isLoading = false;

    constructor(leaf: WorkspaceLeaf, plugin: VirtualAssistantPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Virtual Assistant';
    }

    getIcon(): string {
        return 'bot';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('va-chat-container');

        // Create header
        const header = container.createDiv({ cls: 'va-chat-header' });
        header.createEl('h4', { text: 'Virtual Assistant' });
        
        const headerActions = header.createDiv({ cls: 'va-chat-header-actions' });
        
        const clearBtn = headerActions.createEl('button', { cls: 'va-header-btn' });
        setIcon(clearBtn, 'trash-2');
        clearBtn.setAttribute('aria-label', 'Clear chat');
        clearBtn.onclick = () => this.clearChat();

        const settingsBtn = headerActions.createEl('button', { cls: 'va-header-btn' });
        setIcon(settingsBtn, 'settings');
        settingsBtn.setAttribute('aria-label', 'Settings');
        settingsBtn.onclick = () => {
            // Open plugin settings
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById('virtual-assistant');
        };

        // Create messages container
        this.messagesContainer = container.createDiv({ cls: 'va-messages-container' });

        // Add welcome message
        if (this.chatHistory.length === 0) {
            this.addWelcomeMessage();
        } else {
            // Restore chat history
            for (const msg of this.chatHistory) {
                this.renderMessage(msg);
            }
        }

        // Create input area
        const inputArea = container.createDiv({ cls: 'va-input-area' });
        
        const inputWrapper = inputArea.createDiv({ cls: 'va-input-wrapper' });
        
        this.inputField = inputWrapper.createEl('textarea', {
            cls: 'va-input-field',
            attr: {
                placeholder: 'Ask me anything...',
                rows: '1'
            }
        });

        this.inputField.addEventListener('input', () => {
            this.autoResizeInput();
        });

        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.sendButton = inputWrapper.createEl('button', { cls: 'va-send-btn' });
        setIcon(this.sendButton, 'send');
        this.sendButton.onclick = () => this.sendMessage();

        // Quick actions
        const quickActions = container.createDiv({ cls: 'va-quick-actions' });
        
        this.createQuickAction(quickActions, 'list-todo', 'Create Task', () => {
            this.inputField.value = 'Create a task for: ';
            this.inputField.focus();
        });

        this.createQuickAction(quickActions, 'layout-dashboard', 'New Canvas', () => {
            this.inputField.value = 'Create a canvas for: ';
            this.inputField.focus();
        });

        this.createQuickAction(quickActions, 'file-text', 'Summarize Note', async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.inputField.value = `Summarize the current note: ${activeFile.basename}`;
                await this.sendMessage();
            } else {
                new Notice('No active note to summarize');
            }
        });
    }

    async onClose(): Promise<void> {
        // Save chat history if enabled
        if (this.plugin.settings.chatHistoryEnabled) {
            await this.plugin.saveChatHistory(this.chatHistory);
        }
    }

    private addWelcomeMessage(): void {
        const welcomeEl = this.messagesContainer.createDiv({ cls: 'va-message va-message-assistant va-welcome' });
        
        const content = welcomeEl.createDiv({ cls: 'va-message-content' });
        content.innerHTML = `
            <p>👋 <strong>Hello!</strong> I'm your Virtual Assistant powered by Google Gemini.</p>
            <p>I can help you:</p>
            <ul>
                <li>📝 Create organized task notes</li>
                <li>🎨 Generate visual canvases</li>
                <li>💬 Answer questions about your notes</li>
                <li>🔍 Analyze and summarize content</li>
            </ul>
            <p>How can I assist you today?</p>
        `;
    }

    private createQuickAction(container: HTMLElement, icon: string, label: string, callback: () => void): void {
        const btn = container.createEl('button', { cls: 'va-quick-action-btn' });
        setIcon(btn, icon);
        btn.createSpan({ text: label });
        btn.onclick = callback;
    }

    private autoResizeInput(): void {
        this.inputField.style.height = 'auto';
        const newHeight = Math.min(this.inputField.scrollHeight, 150);
        this.inputField.style.height = `${newHeight}px`;
    }

    private async sendMessage(): Promise<void> {
        const message = this.inputField.value.trim();
        if (!message || this.isLoading) return;

        if (!this.plugin.geminiService.isConfigured()) {
            new Notice('Please configure your Gemini API key in settings');
            return;
        }

        // Clear input
        this.inputField.value = '';
        this.autoResizeInput();

        // Add user message
        const userMessage: ChatMessage = {
            role: 'user',
            content: message,
            timestamp: new Date()
        };
        this.chatHistory.push(userMessage);
        this.renderMessage(userMessage);

        // Show loading indicator
        this.isLoading = true;
        this.sendButton.disabled = true;
        const loadingEl = this.showLoadingIndicator();

        try {
            // Get current note context if enabled
            let context: string | undefined;
            if (this.plugin.settings.includeCurrentNoteAsContext) {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    context = await this.app.vault.read(activeFile);
                }
            }

            // Check for special commands
            const lowerMessage = message.toLowerCase();
            
            if (lowerMessage.startsWith('create a task')) {
                await this.handleCreateTask(message);
            } else if (lowerMessage.startsWith('create a canvas')) {
                await this.handleCreateCanvas(message);
            } else {
                // Regular chat
                const result = await this.plugin.geminiService.generateWithHistory(
                    this.chatHistory.slice(0, -1), // Exclude the message we just added
                    message,
                    'You are a helpful assistant for Obsidian note-taking. Help users organize their thoughts, create tasks, and manage their knowledge base. Be concise but thorough.',
                    context
                );

                if (result.success) {
                    const assistantMessage: ChatMessage = {
                        role: 'assistant',
                        content: result.text,
                        timestamp: new Date()
                    };
                    this.chatHistory.push(assistantMessage);
                    this.renderMessage(assistantMessage);
                } else {
                    this.showError(result.error || 'Failed to generate response');
                }
            }
        } catch (error) {
            this.showError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
            loadingEl.remove();
            this.isLoading = false;
            this.sendButton.disabled = false;
            this.scrollToBottom();
        }
    }

    private async handleCreateTask(message: string): Promise<void> {
        // Extract task description
        const description = message.replace(/^create a task(?: for)?:?\s*/i, '').trim();
        
        if (!description) {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: 'Please provide a description for the task you want to create.',
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
            return;
        }

        const file = await this.plugin.taskService.createTaskFromDescription(description);
        
        if (file) {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: `✅ Task created: **${file.basename}**\n\n[Open task](${file.path})`,
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
        } else {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: '❌ Failed to create task. Please check the console for details.',
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
        }
    }

    private async handleCreateCanvas(message: string): Promise<void> {
        // Extract canvas description  
        const description = message.replace(/^create a canvas(?: for)?:?\s*/i, '').trim();
        
        if (!description) {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: 'Please provide a description for the canvas you want to create. You can specify the type:\n- **taskboard**: Kanban-style task board\n- **riskmatrix**: Risk assessment matrix\n- **mindmap**: Mind map visualization',
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
            return;
        }

        // Detect canvas type from description
        let layoutType: 'taskboard' | 'riskmatrix' | 'personnel' | 'mindmap' = 'mindmap';
        const lowerDesc = description.toLowerCase();
        
        if (lowerDesc.includes('task') || lowerDesc.includes('kanban') || lowerDesc.includes('board')) {
            layoutType = 'taskboard';
        } else if (lowerDesc.includes('risk') || lowerDesc.includes('matrix')) {
            layoutType = 'riskmatrix';
        } else if (lowerDesc.includes('org') || lowerDesc.includes('personnel') || lowerDesc.includes('team')) {
            layoutType = 'personnel';
        }

        const file = await this.plugin.canvasService.createCanvasFromDescription(description, layoutType);
        
        if (file) {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: `✅ Canvas created: **${file.basename}**\n\nLayout type: ${layoutType}\n\n[Open canvas](${file.path})`,
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
        } else {
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: '❌ Failed to create canvas. Please check the console for details.',
                timestamp: new Date()
            };
            this.chatHistory.push(assistantMessage);
            this.renderMessage(assistantMessage);
        }
    }

    private renderMessage(message: ChatMessage): void {
        const msgEl = this.messagesContainer.createDiv({ 
            cls: `va-message va-message-${message.role}` 
        });

        const avatar = msgEl.createDiv({ cls: 'va-message-avatar' });
        setIcon(avatar, message.role === 'user' ? 'user' : 'bot');

        const content = msgEl.createDiv({ cls: 'va-message-content' });
        
        // Render markdown content
        MarkdownRenderer.render(
            this.app,
            message.content,
            content,
            '',
            this
        );

        const timestamp = msgEl.createDiv({ cls: 'va-message-timestamp' });
        timestamp.setText(this.formatTimestamp(message.timestamp));

        this.scrollToBottom();
    }

    private showLoadingIndicator(): HTMLElement {
        const loadingEl = this.messagesContainer.createDiv({ cls: 'va-message va-message-assistant va-loading' });
        const content = loadingEl.createDiv({ cls: 'va-message-content' });
        content.innerHTML = `
            <div class="va-loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        this.scrollToBottom();
        return loadingEl;
    }

    private showError(error: string): void {
        const errorMessage: ChatMessage = {
            role: 'assistant',
            content: `⚠️ **Error:** ${error}`,
            timestamp: new Date()
        };
        this.chatHistory.push(errorMessage);
        this.renderMessage(errorMessage);
    }

    private clearChat(): void {
        this.chatHistory = [];
        this.messagesContainer.empty();
        this.addWelcomeMessage();
        new Notice('Chat cleared');
    }

    private scrollToBottom(): void {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private formatTimestamp(date: Date): string {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Public method to load saved history
    loadChatHistory(history: ChatMessage[]): void {
        this.chatHistory = history;
        this.messagesContainer.empty();
        
        if (history.length === 0) {
            this.addWelcomeMessage();
        } else {
            for (const msg of history) {
                this.renderMessage(msg);
            }
        }
    }
}
