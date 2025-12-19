import { VaultService } from './vault.js';
import * as path from 'path';

export interface TaskData {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dueDate?: string;
    tags: string[];
    subtasks: string[];
}

export interface TaskInfo {
    path: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string;
    tags: string[];
    created?: string;
}

export interface TaskFilter {
    status?: 'pending' | 'in-progress' | 'completed';
    priority?: 'high' | 'medium' | 'low';
    folder?: string;
}

export class TaskManager {
    private vault: VaultService;

    constructor(vault: VaultService) {
        this.vault = vault;
    }

    async createTask(task: TaskData, folder = 'Tasks'): Promise<string> {
        const timestamp = new Date().toISOString();
        const filename = this.sanitizeFilename(task.title);
        const taskPath = path.join(folder, `${filename}.md`);

        const content = this.generateTaskContent(task, timestamp);
        
        return await this.vault.createNote(taskPath, content, false);
    }

    private generateTaskContent(task: TaskData, timestamp: string): string {
        const subtasksText = task.subtasks.length > 0
            ? task.subtasks.map(s => `- [ ] ${s}`).join('\n')
            : '- [ ] Add subtasks here';

        const tagsText = task.tags.length > 0 ? task.tags.join(', ') : '';

        return `---
type: task
status: pending
priority: ${task.priority}
due: ${task.dueDate || ''}
tags: [${tagsText}]
created: ${timestamp}
---

# ${task.title}

## Description
${task.description}

## Subtasks
${subtasksText}

## Notes


## Related

`;
    }

    async listTasks(filter?: TaskFilter): Promise<TaskInfo[]> {
        const folder = filter?.folder || 'Tasks';
        const notes = await this.vault.listNotes(folder);
        const tasks: TaskInfo[] = [];

        for (const note of notes) {
            try {
                const content = await this.vault.readNote(note.path);
                const taskInfo = this.parseTaskNote(note.path, content);
                
                if (!taskInfo) continue;

                // Apply filters
                if (filter?.status && taskInfo.status !== filter.status) continue;
                if (filter?.priority && taskInfo.priority !== filter.priority) continue;

                tasks.push(taskInfo);
            } catch {
                // Skip files that can't be read
            }
        }

        // Sort by priority (high > medium > low) then by created date
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return tasks.sort((a, b) => {
            const priorityDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
            if (priorityDiff !== 0) return priorityDiff;
            
            // Sort by created date (newest first)
            if (a.created && b.created) {
                return new Date(b.created).getTime() - new Date(a.created).getTime();
            }
            return 0;
        });
    }

    private parseTaskNote(notePath: string, content: string): TaskInfo | null {
        // Check if this is a task note
        if (!content.includes('type: task')) {
            return null;
        }

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            return null;
        }

        const frontmatter = frontmatterMatch[1];
        
        // Parse frontmatter fields
        const getValue = (key: string): string => {
            const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
            return match ? match[1].trim() : '';
        };

        const getArrayValue = (key: string): string[] => {
            const match = frontmatter.match(new RegExp(`^${key}:\\s*\\[(.*)\\]`, 'm'));
            if (!match) return [];
            return match[1].split(',').map(s => s.trim()).filter(s => s);
        };

        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : path.basename(notePath, '.md');

        return {
            path: notePath,
            title,
            status: getValue('status') || 'pending',
            priority: getValue('priority') || 'medium',
            dueDate: getValue('due') || undefined,
            tags: getArrayValue('tags'),
            created: getValue('created') || undefined
        };
    }

    async updateTaskStatus(taskPath: string, status: 'pending' | 'in-progress' | 'completed'): Promise<void> {
        const content = await this.vault.readNote(taskPath);
        
        // Update status in frontmatter
        const updatedContent = content.replace(
            /^(status:\s*).*$/m,
            `$1${status}`
        );

        await this.vault.updateNote(taskPath, updatedContent, false);
    }

    async updateTaskPriority(taskPath: string, priority: 'high' | 'medium' | 'low'): Promise<void> {
        const content = await this.vault.readNote(taskPath);
        
        const updatedContent = content.replace(
            /^(priority:\s*).*$/m,
            `$1${priority}`
        );

        await this.vault.updateNote(taskPath, updatedContent, false);
    }

    async addSubtask(taskPath: string, subtask: string): Promise<void> {
        const content = await this.vault.readNote(taskPath);
        
        // Find the Subtasks section and add the new subtask
        const subtasksMatch = content.match(/(## Subtasks\n)([\s\S]*?)(\n## |\n---|\n$)/);
        
        if (subtasksMatch) {
            const before = content.substring(0, subtasksMatch.index! + subtasksMatch[1].length);
            const subtasksSection = subtasksMatch[2];
            const after = content.substring(subtasksMatch.index! + subtasksMatch[1].length + subtasksMatch[2].length);
            
            const newSubtask = `- [ ] ${subtask}\n`;
            const updatedContent = before + subtasksSection.trimEnd() + '\n' + newSubtask + after;
            
            await this.vault.updateNote(taskPath, updatedContent, false);
        }
    }

    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, '-')
            .substring(0, 100);
    }
}
