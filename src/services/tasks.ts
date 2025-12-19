import { App, TFile, TFolder, Notice } from 'obsidian';
import { VirtualAssistantSettings } from '../settings';
import { GeminiService } from './gemini';

// Helper function to format date
function formatDate(format: string): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const replacements: Record<string, string> = {
        'YYYY': now.getFullYear().toString(),
        'MM': pad(now.getMonth() + 1),
        'DD': pad(now.getDate()),
        'HH': pad(now.getHours()),
        'mm': pad(now.getMinutes()),
        'ss': pad(now.getSeconds()),
        'Z': now.toISOString().slice(-6)
    };
    
    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
    }
    return result;
}

export interface TaskData {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    due_date: string;
    tags: string[];
    subtasks: string[];
    notes: string;
    related: string[];
}

export class TaskService {
    private app: App;
    private settings: VirtualAssistantSettings;
    private geminiService: GeminiService;

    constructor(app: App, settings: VirtualAssistantSettings, geminiService: GeminiService) {
        this.app = app;
        this.settings = settings;
        this.geminiService = geminiService;
    }

    updateSettings(settings: VirtualAssistantSettings): void {
        this.settings = settings;
    }

    async createTaskFromDescription(description: string): Promise<TFile | null> {
        if (!this.geminiService.isConfigured()) {
            new Notice('Please configure your Gemini API key in settings');
            return null;
        }

        new Notice('Generating task...');

        const result = await this.geminiService.generateTaskFromDescription(description);

        if (!result.success) {
            new Notice(`Error generating task: ${result.error}`);
            return null;
        }

        try {
            const taskData = this.parseTaskData(result.text);
            return await this.createTaskNote(taskData);
        } catch (error) {
            new Notice(`Error parsing task data: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    private parseTaskData(jsonString: string): TaskData {
        // Clean up potential markdown code blocks
        let cleaned = jsonString.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        const parsed = JSON.parse(cleaned);

        return {
            title: parsed.title || 'Untitled Task',
            description: parsed.description || '',
            priority: parsed.priority || 'medium',
            due_date: parsed.due_date || '',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
            notes: parsed.notes || '',
            related: Array.isArray(parsed.related) ? parsed.related : []
        };
    }

    async createTaskNote(taskData: TaskData): Promise<TFile> {
        // Ensure the task folder exists
        await this.ensureFolderExists(this.settings.taskTemplateFolder);

        // Generate the note content from template
        const content = this.applyTemplate(taskData);

        // Create a safe filename
        const filename = this.sanitizeFilename(taskData.title);
        const timestamp = formatDate('YYYYMMDD-HHmmss');
        const fullPath = `${this.settings.taskTemplateFolder}/${filename}-${timestamp}.md`;

        // Create the file
        const file = await this.app.vault.create(fullPath, content);
        new Notice(`Task created: ${taskData.title}`);

        return file;
    }

    private applyTemplate(taskData: TaskData): string {
        let content = this.settings.taskTemplate;

        // Replace template variables
        content = content.replace(/\{\{title\}\}/g, taskData.title);
        content = content.replace(/\{\{description\}\}/g, taskData.description);
        content = content.replace(/\{\{priority\}\}/g, taskData.priority);
        content = content.replace(/\{\{due_date\}\}/g, taskData.due_date || 'Not set');
        content = content.replace(/\{\{tags\}\}/g, taskData.tags.join(', '));
        content = content.replace(/\{\{created_date\}\}/g, new Date().toISOString());
        
        // Format subtasks as checkboxes
        const subtasksFormatted = taskData.subtasks.length > 0
            ? taskData.subtasks.map(s => `- [ ] ${s}`).join('\n')
            : '- [ ] Add subtasks here';
        content = content.replace(/\{\{subtasks\}\}/g, subtasksFormatted);

        content = content.replace(/\{\{notes\}\}/g, taskData.notes || 'No additional notes');

        // Format related items as links
        const relatedFormatted = taskData.related.length > 0
            ? taskData.related.map(r => `- [[${r}]]`).join('\n')
            : '';
        content = content.replace(/\{\{related\}\}/g, relatedFormatted);

        return content;
    }

    async createQuickTask(title: string, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<TFile> {
        const taskData: TaskData = {
            title,
            description: '',
            priority,
            due_date: '',
            tags: [],
            subtasks: [],
            notes: '',
            related: []
        };

        return this.createTaskNote(taskData);
    }

    async listTasks(filter?: {
        status?: 'pending' | 'in-progress' | 'completed';
        priority?: 'high' | 'medium' | 'low';
        tag?: string;
    }): Promise<TFile[]> {
        const taskFolder = this.app.vault.getAbstractFileByPath(this.settings.taskTemplateFolder);
        
        if (!taskFolder || !(taskFolder instanceof TFolder)) {
            return [];
        }

        const tasks: TFile[] = [];

        const processFolder = async (folder: TFolder) => {
            for (const child of folder.children) {
                if (child instanceof TFile && child.extension === 'md') {
                    if (!filter) {
                        tasks.push(child);
                        continue;
                    }

                    // Read file and check against filter
                    const content = await this.app.vault.read(child);
                    const frontmatter = this.parseFrontmatter(content);

                    let matches = true;
                    if (filter.status && frontmatter.status !== filter.status) {
                        matches = false;
                    }
                    if (filter.priority && frontmatter.priority !== filter.priority) {
                        matches = false;
                    }
                    if (filter.tag && (!Array.isArray(frontmatter.tags) || !frontmatter.tags.includes(filter.tag))) {
                        matches = false;
                    }

                    if (matches) {
                        tasks.push(child);
                    }
                } else if (child instanceof TFolder) {
                    await processFolder(child);
                }
            }
        };

        await processFolder(taskFolder);
        return tasks;
    }

    private parseFrontmatter(content: string): Record<string, unknown> {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            return {};
        }

        const frontmatterText = frontmatterMatch[1];
        const result: Record<string, unknown> = {};

        for (const line of frontmatterText.split('\n')) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.slice(0, colonIndex).trim();
                let value: unknown = line.slice(colonIndex + 1).trim();

                // Parse arrays
                if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
                    try {
                        value = JSON.parse(value.replace(/'/g, '"'));
                    } catch {
                        // Keep as string if parsing fails
                    }
                }

                result[key] = value;
            }
        }

        return result;
    }

    async updateTaskStatus(file: TFile, status: 'pending' | 'in-progress' | 'completed'): Promise<void> {
        const content = await this.app.vault.read(file);
        const updatedContent = content.replace(
            /^(status:\s*).*$/m,
            `$1${status}`
        );
        await this.app.vault.modify(file, updatedContent);
        new Notice(`Task status updated to: ${status}`);
    }

    private async ensureFolderExists(path: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }

    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, '-')
            .substring(0, 100);
    }
}
