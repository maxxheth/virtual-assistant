import { Plugin, WorkspaceLeaf, Menu, TFile, Notice, Modal, App, Setting } from 'obsidian';
import { VirtualAssistantSettings, VirtualAssistantSettingTab, DEFAULT_SETTINGS } from './settings';
import { GeminiService, ChatMessage } from './services/gemini';
import { TaskService } from './services/tasks';
import { CanvasService, LayoutType } from './services/canvas';
import { ChatSidebarView, CHAT_VIEW_TYPE } from './views/ChatSidebarView';

export default class VirtualAssistantPlugin extends Plugin {
    settings!: VirtualAssistantSettings;
    geminiService!: GeminiService;
    taskService!: TaskService;
    canvasService!: CanvasService;
    private chatHistory: ChatMessage[] = [];

    async onload(): Promise<void> {
        console.log('Loading Virtual Assistant plugin');

        // Load settings
        await this.loadSettings();

        // Initialize services
        this.geminiService = new GeminiService(this.settings);
        this.taskService = new TaskService(this.app, this.settings, this.geminiService);
        this.canvasService = new CanvasService(this.app, this.settings, this.geminiService);

        // Load chat history
        await this.loadChatHistory();

        // Register the chat sidebar view
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf) => new ChatSidebarView(leaf, this)
        );

        // Add ribbon icon to open chat sidebar
        this.addRibbonIcon('bot', 'Virtual Assistant', () => {
            this.activateChatView();
        });

        // Add settings tab
        this.addSettingTab(new VirtualAssistantSettingTab(this.app, this));

        // Register commands
        this.registerCommands();

        // Add file menu items
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('Create canvas from note')
                            .setIcon('layout-dashboard')
                            .onClick(async () => {
                                await this.createCanvasFromNote(file);
                            });
                    });
                }
            })
        );

        // Auto-activate sidebar on layout ready if it was open before
        this.app.workspace.onLayoutReady(() => {
            this.initLeaf();
        });
    }

    async onunload(): Promise<void> {
        console.log('Unloading Virtual Assistant plugin');
        
        // Save chat history
        await this.saveChatHistory(this.chatHistory);
        
        // Detach all views
        this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        
        // Update services with new settings
        this.geminiService.updateSettings(this.settings);
        this.taskService.updateSettings(this.settings);
        this.canvasService.updateSettings(this.settings);
    }

    async loadChatHistory(): Promise<void> {
        if (!this.settings.chatHistoryEnabled) {
            this.chatHistory = [];
            return;
        }

        try {
            const data = await this.loadData();
            if (data?.chatHistory) {
                this.chatHistory = data.chatHistory.map((msg: {
                    role: 'user' | 'assistant';
                    content: string;
                    timestamp: string;
                }) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                
                // Limit history size
                if (this.chatHistory.length > this.settings.maxChatHistory) {
                    this.chatHistory = this.chatHistory.slice(-this.settings.maxChatHistory);
                }
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
            this.chatHistory = [];
        }
    }

    async saveChatHistory(history: ChatMessage[]): Promise<void> {
        if (!this.settings.chatHistoryEnabled) {
            return;
        }

        this.chatHistory = history;
        
        const data = await this.loadData() || {};
        data.chatHistory = history.slice(-this.settings.maxChatHistory);
        await this.saveData(data);
    }

    private registerCommands(): void {
        // Open chat sidebar
        this.addCommand({
            id: 'open-chat-sidebar',
            name: 'Open chat sidebar',
            callback: () => {
                this.activateChatView();
            }
        });

        // Create task from selection
        this.addCommand({
            id: 'create-task-from-selection',
            name: 'Create task from selection',
            editorCallback: async (editor) => {
                const selection = editor.getSelection();
                if (!selection) {
                    new Notice('Please select some text first');
                    return;
                }
                await this.taskService.createTaskFromDescription(selection);
            }
        });

        // Create quick task
        this.addCommand({
            id: 'create-quick-task',
            name: 'Create quick task',
            callback: () => {
                new QuickTaskModal(this.app, this.taskService).open();
            }
        });

        // Create canvas from selection
        this.addCommand({
            id: 'create-canvas-from-selection',
            name: 'Create canvas from selection',
            editorCallback: async (editor) => {
                const selection = editor.getSelection();
                if (!selection) {
                    new Notice('Please select some text first');
                    return;
                }
                new CanvasTypeModal(this.app, async (layoutType) => {
                    await this.canvasService.createCanvasFromDescription(selection, layoutType);
                }).open();
            }
        });

        // Generate taskboard canvas
        this.addCommand({
            id: 'generate-taskboard',
            name: 'Generate taskboard canvas',
            callback: async () => {
                new CanvasDescriptionModal(this.app, 'taskboard', async (description) => {
                    await this.canvasService.createCanvasFromDescription(description, 'taskboard');
                }).open();
            }
        });

        // Generate risk matrix
        this.addCommand({
            id: 'generate-risk-matrix',
            name: 'Generate risk matrix canvas',
            callback: async () => {
                new CanvasDescriptionModal(this.app, 'riskmatrix', async (description) => {
                    await this.canvasService.createCanvasFromDescription(description, 'riskmatrix');
                }).open();
            }
        });

        // Generate mind map
        this.addCommand({
            id: 'generate-mindmap',
            name: 'Generate mind map canvas',
            callback: async () => {
                new CanvasDescriptionModal(this.app, 'mindmap', async (description) => {
                    await this.canvasService.createCanvasFromDescription(description, 'mindmap');
                }).open();
            }
        });

        // Test API connection
        this.addCommand({
            id: 'test-api-connection',
            name: 'Test Gemini API connection',
            callback: async () => {
                new Notice('Testing connection...');
                const result = await this.geminiService.testConnection();
                if (result.success) {
                    new Notice('✅ Connection successful!');
                } else {
                    new Notice(`❌ ${result.error || 'Connection failed'}`);
                }
            }
        });
    }

    private async activateChatView(): Promise<void> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

        if (leaves.length > 0) {
            // View already exists, reveal it
            leaf = leaves[0];
        } else {
            // Create new leaf in right sidebar
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
            
            // Load chat history into view
            const view = leaf.view as ChatSidebarView;
            if (view && this.chatHistory.length > 0) {
                view.loadChatHistory(this.chatHistory);
            }
        }
    }

    private initLeaf(): void {
        // Check if we should auto-open the sidebar
        const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
        if (leaves.length === 0) {
            // Don't auto-open on startup, let user open it manually
        }
    }

    private async createCanvasFromNote(file: TFile): Promise<void> {
        const content = await this.app.vault.read(file);
        
        new CanvasTypeModal(this.app, async (layoutType) => {
            await this.canvasService.createCanvasFromDescription(
                content,
                layoutType,
                `${file.basename}-${layoutType}`
            );
        }).open();
    }
}

// Quick Task Modal
class QuickTaskModal extends Modal {
    private taskService: TaskService;
    private titleInput!: HTMLInputElement;
    private prioritySelect!: HTMLSelectElement;

    constructor(app: App, taskService: TaskService) {
        super(app);
        this.taskService = taskService;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('va-modal-content');

        contentEl.createEl('h2', { text: 'Create Quick Task' });

        const titleField = contentEl.createDiv({ cls: 'va-modal-field' });
        titleField.createEl('label', { text: 'Task Title' });
        this.titleInput = titleField.createEl('input', {
            type: 'text',
            placeholder: 'Enter task title...'
        });
        this.titleInput.focus();

        const priorityField = contentEl.createDiv({ cls: 'va-modal-field' });
        priorityField.createEl('label', { text: 'Priority' });
        this.prioritySelect = priorityField.createEl('select');
        this.prioritySelect.createEl('option', { text: 'Medium', value: 'medium' });
        this.prioritySelect.createEl('option', { text: 'High', value: 'high' });
        this.prioritySelect.createEl('option', { text: 'Low', value: 'low' });

        const actions = contentEl.createDiv({ cls: 'va-modal-actions' });
        
        const cancelBtn = actions.createEl('button', { 
            text: 'Cancel', 
            cls: 'va-btn-secondary' 
        });
        cancelBtn.onclick = () => this.close();

        const createBtn = actions.createEl('button', { 
            text: 'Create', 
            cls: 'va-btn-primary' 
        });
        createBtn.onclick = async () => {
            const title = this.titleInput.value.trim();
            if (!title) {
                new Notice('Please enter a task title');
                return;
            }
            await this.taskService.createQuickTask(
                title, 
                this.prioritySelect.value as 'high' | 'medium' | 'low'
            );
            this.close();
        };

        // Handle enter key
        this.titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                createBtn.click();
            }
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Canvas Type Selection Modal
class CanvasTypeModal extends Modal {
    private callback: (layoutType: LayoutType) => Promise<void>;

    constructor(app: App, callback: (layoutType: LayoutType) => Promise<void>) {
        super(app);
        this.callback = callback;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('va-modal-content');

        contentEl.createEl('h2', { text: 'Choose Canvas Type' });

        const types: { type: LayoutType; name: string; description: string; icon: string }[] = [
            { type: 'taskboard', name: 'Task Board', description: 'Kanban-style board with columns', icon: '📋' },
            { type: 'riskmatrix', name: 'Risk Matrix', description: '2D grid for risk assessment', icon: '⚠️' },
            { type: 'personnel', name: 'Personnel Map', description: 'Org chart with roles', icon: '👥' },
            { type: 'mindmap', name: 'Mind Map', description: 'Radial brainstorming layout', icon: '🧠' }
        ];

        const grid = contentEl.createDiv({ cls: 'va-canvas-type-grid' });
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gap = '12px';
        grid.style.marginTop = '16px';

        types.forEach(({ type, name, description, icon }) => {
            const card = grid.createDiv({ cls: 'va-canvas-type-card' });
            card.style.padding = '16px';
            card.style.border = '1px solid var(--background-modifier-border)';
            card.style.borderRadius = '8px';
            card.style.cursor = 'pointer';
            card.style.transition = 'all 0.2s ease';

            card.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 8px;">${icon}</div>
                <div style="font-weight: 600; margin-bottom: 4px;">${name}</div>
                <div style="font-size: 12px; color: var(--text-muted);">${description}</div>
            `;

            card.addEventListener('mouseenter', () => {
                card.style.borderColor = 'var(--interactive-accent)';
                card.style.background = 'var(--background-secondary)';
            });

            card.addEventListener('mouseleave', () => {
                card.style.borderColor = 'var(--background-modifier-border)';
                card.style.background = 'transparent';
            });

            card.onclick = async () => {
                this.close();
                await this.callback(type);
            };
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Canvas Description Modal
class CanvasDescriptionModal extends Modal {
    private layoutType: LayoutType;
    private callback: (description: string) => Promise<void>;
    private textArea!: HTMLTextAreaElement;

    constructor(app: App, layoutType: LayoutType, callback: (description: string) => Promise<void>) {
        super(app);
        this.layoutType = layoutType;
        this.callback = callback;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('va-modal-content');

        const titles: Record<LayoutType, string> = {
            taskboard: 'Create Task Board',
            riskmatrix: 'Create Risk Matrix',
            personnel: 'Create Personnel Map',
            mindmap: 'Create Mind Map'
        };

        const placeholders: Record<LayoutType, string> = {
            taskboard: 'Describe your project tasks, deadlines, and priorities...',
            riskmatrix: 'List the risks, their likelihood (low/medium/high), and impact...',
            personnel: 'Describe the team structure, roles, and responsibilities...',
            mindmap: 'Describe the main topic and its related concepts...'
        };

        contentEl.createEl('h2', { text: titles[this.layoutType] });

        const field = contentEl.createDiv({ cls: 'va-modal-field' });
        field.createEl('label', { text: 'Description' });
        this.textArea = field.createEl('textarea', {
            placeholder: placeholders[this.layoutType]
        });
        this.textArea.style.minHeight = '150px';
        this.textArea.focus();

        const actions = contentEl.createDiv({ cls: 'va-modal-actions' });
        
        const cancelBtn = actions.createEl('button', { 
            text: 'Cancel', 
            cls: 'va-btn-secondary' 
        });
        cancelBtn.onclick = () => this.close();

        const createBtn = actions.createEl('button', { 
            text: 'Generate Canvas', 
            cls: 'va-btn-primary' 
        });
        createBtn.onclick = async () => {
            const description = this.textArea.value.trim();
            if (!description) {
                new Notice('Please enter a description');
                return;
            }
            this.close();
            await this.callback(description);
        };
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
