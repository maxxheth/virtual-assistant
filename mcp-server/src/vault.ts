import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

export interface NoteInfo {
    name: string;
    path: string;
    size: number;
    modified: Date;
}

export interface SearchResult {
    path: string;
    name: string;
    matches: string[];
    score: number;
}

export interface VaultInfo {
    path: string;
    noteCount: number;
    folderCount: number;
    canvasCount: number;
    totalSize: number;
    folders: string[];
}

export class VaultService {
    private vaultPath: string;

    constructor(vaultPath: string) {
        this.vaultPath = vaultPath;
    }

    async verifyVault(): Promise<boolean> {
        try {
            const stats = await fs.stat(this.vaultPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    private resolvePath(relativePath: string): string {
        // Ensure path is within vault (security)
        const resolved = path.resolve(this.vaultPath, relativePath);
        if (!resolved.startsWith(this.vaultPath)) {
            throw new Error('Path traversal not allowed');
        }
        return resolved;
    }

    async readNote(notePath: string): Promise<string> {
        const fullPath = this.resolvePath(notePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
    }

    async createNote(notePath: string, content: string, overwrite = false): Promise<string> {
        const fullPath = this.resolvePath(notePath);
        
        // Ensure .md extension
        const finalPath = fullPath.endsWith('.md') ? fullPath : `${fullPath}.md`;

        // Check if file exists
        try {
            await fs.access(finalPath);
            if (!overwrite) {
                throw new Error(`Note already exists: ${notePath}`);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        // Create parent directories if needed
        const dir = path.dirname(finalPath);
        await fs.mkdir(dir, { recursive: true });

        // Write the file
        await fs.writeFile(finalPath, content, 'utf-8');
        
        return path.relative(this.vaultPath, finalPath);
    }

    async updateNote(notePath: string, content: string, append = false): Promise<void> {
        const fullPath = this.resolvePath(notePath);

        if (append) {
            const existing = await fs.readFile(fullPath, 'utf-8');
            content = existing + '\n' + content;
        }

        await fs.writeFile(fullPath, content, 'utf-8');
    }

    async deleteNote(notePath: string): Promise<void> {
        const fullPath = this.resolvePath(notePath);
        await fs.unlink(fullPath);
    }

    async listNotes(folder?: string): Promise<NoteInfo[]> {
        const searchPath = folder 
            ? path.join(this.vaultPath, folder, '**/*.md')
            : path.join(this.vaultPath, '**/*.md');

        const files = await glob(searchPath, {
            ignore: ['**/node_modules/**', '**/.obsidian/**']
        });

        const notes: NoteInfo[] = await Promise.all(
            files.map(async (file) => {
                const stats = await fs.stat(file);
                return {
                    name: path.basename(file, '.md'),
                    path: path.relative(this.vaultPath, file),
                    size: stats.size,
                    modified: stats.mtime
                };
            })
        );

        return notes.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    }

    async searchNotes(
        query: string, 
        searchType: 'content' | 'filename' | 'both' = 'both'
    ): Promise<SearchResult[]> {
        const notes = await this.listNotes();
        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();

        for (const note of notes) {
            let matches: string[] = [];
            let score = 0;

            // Filename search
            if (searchType === 'filename' || searchType === 'both') {
                if (note.name.toLowerCase().includes(queryLower)) {
                    matches.push(`Filename match: ${note.name}`);
                    score += note.name.toLowerCase() === queryLower ? 100 : 50;
                }
            }

            // Content search
            if (searchType === 'content' || searchType === 'both') {
                try {
                    const content = await this.readNote(note.path);
                    const contentLower = content.toLowerCase();
                    
                    if (contentLower.includes(queryLower)) {
                        // Find context around the match
                        const index = contentLower.indexOf(queryLower);
                        const start = Math.max(0, index - 50);
                        const end = Math.min(content.length, index + query.length + 50);
                        const context = content.substring(start, end);
                        
                        matches.push(`Content: ...${context}...`);
                        
                        // Count occurrences for scoring
                        const occurrences = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
                        score += occurrences * 10;
                    }
                } catch {
                    // Skip files that can't be read
                }
            }

            if (matches.length > 0) {
                results.push({
                    path: note.path,
                    name: note.name,
                    matches,
                    score
                });
            }
        }

        return results.sort((a, b) => b.score - a.score);
    }

    async listFolders(): Promise<string[]> {
        const folders: string[] = [];
        
        const walkDir = async (dir: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fullPath = path.join(dir, entry.name);
                    // Skip hidden folders and node_modules
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        const relativePath = path.relative(this.vaultPath, fullPath);
                        folders.push(relativePath);
                        await walkDir(fullPath);
                    }
                }
            }
        };
        
        await walkDir(this.vaultPath);
        return folders.sort();
    }

    async createFolder(folderPath: string): Promise<void> {
        const fullPath = this.resolvePath(folderPath);
        await fs.mkdir(fullPath, { recursive: true });
    }

    async getVaultInfo(): Promise<VaultInfo> {
        const [notes, folders, canvases] = await Promise.all([
            this.listNotes(),
            this.listFolders(),
            glob(path.join(this.vaultPath, '**/*.canvas'), {
                ignore: ['**/node_modules/**', '**/.obsidian/**']
            })
        ]);

        const totalSize = notes.reduce((sum, note) => sum + note.size, 0);

        return {
            path: this.vaultPath,
            noteCount: notes.length,
            folderCount: folders.length,
            canvasCount: canvases.length,
            totalSize,
            folders
        };
    }

    async readCanvas(canvasPath: string): Promise<object> {
        const fullPath = this.resolvePath(canvasPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return JSON.parse(content);
    }

    async writeCanvas(canvasPath: string, data: object): Promise<string> {
        const fullPath = this.resolvePath(canvasPath);
        
        // Ensure .canvas extension
        const finalPath = fullPath.endsWith('.canvas') ? fullPath : `${fullPath}.canvas`;

        // Create parent directories if needed
        const dir = path.dirname(finalPath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(finalPath, JSON.stringify(data, null, 2), 'utf-8');
        
        return path.relative(this.vaultPath, finalPath);
    }
}
