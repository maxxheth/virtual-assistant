import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import VirtualAssistantPlugin from './main';

export interface VirtualAssistantSettings {
    geminiApiKey: string;
    defaultModel: 'gemini-3-pro-preview' | 'gemini-3-flash-preview' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro';
    taskTemplateFolder: string;
    canvasOutputFolder: string;
    chatHistoryEnabled: boolean;
    maxChatHistory: number;
    includeCurrentNoteAsContext: boolean;
    taskTemplate: string;
}

export const DEFAULT_SETTINGS: VirtualAssistantSettings = {
    geminiApiKey: '',
    defaultModel: 'gemini-2.5-flash',
    taskTemplateFolder: 'Tasks',
    canvasOutputFolder: 'Canvas',
    chatHistoryEnabled: true,
    maxChatHistory: 50,
    includeCurrentNoteAsContext: true,
    taskTemplate: `---
type: task
status: pending
priority: {{priority}}
due: {{due_date}}
tags: [{{tags}}]
created: {{created_date}}
---

# {{title}}

## Description
{{description}}

## Subtasks
{{subtasks}}

## Notes
{{notes}}

## Related
{{related}}
`
};

export class VirtualAssistantSettingTab extends PluginSettingTab {
    plugin: VirtualAssistantPlugin;

    constructor(app: App, plugin: VirtualAssistantPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Virtual Assistant Settings' });

        // API Configuration Section
        containerEl.createEl('h2', { text: 'Google AI Studio Configuration' });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Your Google AI Studio API key. Get one at aistudio.google.com')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value;
                    await this.plugin.saveSettings();
                })
            )
            .addButton(button => button
                .setButtonText('Test Connection')
                .onClick(async () => {
                    await this.testApiConnection();
                })
            );

        new Setting(containerEl)
            .setName('Default Model')
            .setDesc('The default Gemini model to use for generation')
            .addDropdown(dropdown => dropdown
                .addOption('gemini-3-pro-preview', 'Gemini 3.0 Pro Preview (Most Advanced)')
                .addOption('gemini-3-flash-preview', 'Gemini 3.0 Flash Preview (Latest, Fast)')
                .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash (Recommended)')
                .addOption('gemini-2.5-pro', 'Gemini 2.5 Pro (Powerful)')
                .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash (Legacy)')
                .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro (Legacy)')
                .setValue(this.plugin.settings.defaultModel)
                .onChange(async (value) => {
                    this.plugin.settings.defaultModel = value as 'gemini-3-pro-preview' | 'gemini-3-flash-preview' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro';
                    await this.plugin.saveSettings();
                })
            );

        // Folder Configuration
        containerEl.createEl('h2', { text: 'Folder Configuration' });

        new Setting(containerEl)
            .setName('Task Folder')
            .setDesc('Folder where task notes will be created')
            .addText(text => text
                .setPlaceholder('Tasks')
                .setValue(this.plugin.settings.taskTemplateFolder)
                .onChange(async (value) => {
                    this.plugin.settings.taskTemplateFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Canvas Output Folder')
            .setDesc('Folder where generated canvases will be saved')
            .addText(text => text
                .setPlaceholder('Canvas')
                .setValue(this.plugin.settings.canvasOutputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.canvasOutputFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        // Chat Configuration
        containerEl.createEl('h2', { text: 'Chat Configuration' });

        new Setting(containerEl)
            .setName('Enable Chat History')
            .setDesc('Remember conversation history across sessions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.chatHistoryEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.chatHistoryEnabled = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Max Chat History')
            .setDesc('Maximum number of messages to remember')
            .addSlider(slider => slider
                .setLimits(10, 100, 10)
                .setValue(this.plugin.settings.maxChatHistory)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxChatHistory = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Include Current Note as Context')
            .setDesc('Automatically include the active note content when chatting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeCurrentNoteAsContext)
                .onChange(async (value) => {
                    this.plugin.settings.includeCurrentNoteAsContext = value;
                    await this.plugin.saveSettings();
                })
            );

        // Task Template
        containerEl.createEl('h2', { text: 'Task Template' });

        new Setting(containerEl)
            .setName('Task Note Template')
            .setDesc('Template for generated task notes. Use {{variable}} for placeholders.')
            .addTextArea(text => text
                .setPlaceholder('Enter your task template')
                .setValue(this.plugin.settings.taskTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.taskTemplate = value;
                    await this.plugin.saveSettings();
                })
            );

        // Reset button
        containerEl.createEl('h2', { text: 'Reset' });

        new Setting(containerEl)
            .setName('Reset to Defaults')
            .setDesc('Reset all settings to their default values')
            .addButton(button => button
                .setButtonText('Reset')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings = { ...DEFAULT_SETTINGS };
                    await this.plugin.saveSettings();
                    this.display();
                    new Notice('Settings reset to defaults');
                })
            );
    }

    private async testApiConnection(): Promise<void> {
        if (!this.plugin.settings.geminiApiKey && !process.env.GEMINI_API_KEY) {
            new Notice('Please enter an API key first');
            return;
        }

        try {
            new Notice('Testing connection...');
            const result = await this.plugin.geminiService.testConnection();
            if (result.success) {
                new Notice('✅ Connection successful!');
            } else {
                new Notice(`❌ Connection failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            new Notice(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
