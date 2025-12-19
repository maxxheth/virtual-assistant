import { App, TFile, Notice } from 'obsidian';
import { VirtualAssistantSettings } from '../settings';
import { GeminiService } from './gemini';

// Simple ID generator (no uuid dependency needed)
function generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// JSON Canvas spec types
export interface CanvasNode {
    id: string;
    type: 'text' | 'file' | 'link' | 'group';
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    file?: string;
    subpath?: string;
    url?: string;
    label?: string;
    background?: string;
    backgroundStyle?: 'cover' | 'ratio' | 'repeat';
    color?: string;
}

export interface CanvasEdge {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: 'top' | 'right' | 'bottom' | 'left';
    toSide?: 'top' | 'right' | 'bottom' | 'left';
    fromEnd?: 'none' | 'arrow';
    toEnd?: 'none' | 'arrow';
    color?: string;
    label?: string;
}

export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
}

export type LayoutType = 'taskboard' | 'riskmatrix' | 'personnel' | 'mindmap';

export class CanvasService {
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

    generateId(): string {
        return generateUniqueId();
    }

    async createCanvasFromDescription(
        description: string,
        layoutType: LayoutType,
        canvasName?: string
    ): Promise<TFile | null> {
        if (!this.geminiService.isConfigured()) {
            new Notice('Please configure your Gemini API key in settings');
            return null;
        }

        new Notice(`Generating ${layoutType} canvas...`);

        const result = await this.geminiService.generateCanvasLayout(description, layoutType);

        if (!result.success) {
            new Notice(`Error generating canvas: ${result.error}`);
            return null;
        }

        try {
            const canvasData = this.parseCanvasData(result.text);
            const validatedData = this.validateAndFixCanvasData(canvasData);
            return await this.saveCanvas(validatedData, canvasName || `${layoutType}-${Date.now()}`);
        } catch (error) {
            new Notice(`Error creating canvas: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error('Canvas generation error:', error);
            return null;
        }
    }

    private parseCanvasData(jsonString: string): CanvasData {
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

        return JSON.parse(cleaned) as CanvasData;
    }

    private validateAndFixCanvasData(data: CanvasData): CanvasData {
        const nodes = (data.nodes || []).map(node => ({
            id: node.id || this.generateId(),
            type: node.type || 'text',
            x: typeof node.x === 'number' ? node.x : 0,
            y: typeof node.y === 'number' ? node.y : 0,
            width: typeof node.width === 'number' ? node.width : 200,
            height: typeof node.height === 'number' ? node.height : 100,
            ...(node.text && { text: node.text }),
            ...(node.file && { file: node.file }),
            ...(node.label && { label: node.label }),
            ...(node.color && { color: node.color })
        }));

        const nodeIds = new Set(nodes.map(n => n.id));
        const edges = (data.edges || []).filter(edge => 
            nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode)
        ).map(edge => ({
            id: edge.id || this.generateId(),
            fromNode: edge.fromNode,
            toNode: edge.toNode,
            ...(edge.fromSide && { fromSide: edge.fromSide }),
            ...(edge.toSide && { toSide: edge.toSide }),
            ...(edge.label && { label: edge.label }),
            ...(edge.color && { color: edge.color })
        }));

        return { nodes, edges };
    }

    async saveCanvas(data: CanvasData, name: string): Promise<TFile> {
        await this.ensureFolderExists(this.settings.canvasOutputFolder);

        const filename = this.sanitizeFilename(name);
        const fullPath = `${this.settings.canvasOutputFolder}/${filename}.canvas`;

        const content = JSON.stringify(data, null, 2);

        // Check if file exists
        const existing = this.app.vault.getAbstractFileByPath(fullPath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
            new Notice(`Canvas updated: ${filename}`);
            return existing;
        }

        const file = await this.app.vault.create(fullPath, content);
        new Notice(`Canvas created: ${filename}`);
        return file;
    }

    // Pre-built layout generators for manual canvas creation

    createTaskboardCanvas(tasks: Array<{ title: string; status: string; priority?: string }>): CanvasData {
        const columns = ['To Do', 'In Progress', 'Review', 'Done'];
        const columnWidth = 250;
        const nodeHeight = 80;
        const padding = 20;
        const headerHeight = 50;

        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // Create column headers
        columns.forEach((col, i) => {
            nodes.push({
                id: this.generateId(),
                type: 'group',
                x: i * (columnWidth + padding),
                y: 0,
                width: columnWidth,
                height: headerHeight + (tasks.filter(t => this.mapStatusToColumn(t.status) === col).length + 1) * (nodeHeight + padding),
                label: col,
                color: this.getColumnColor(col)
            });
        });

        // Create task nodes
        const columnCounts: Record<string, number> = { 'To Do': 0, 'In Progress': 0, 'Review': 0, 'Done': 0 };

        tasks.forEach(task => {
            const column = this.mapStatusToColumn(task.status);
            const colIndex = columns.indexOf(column);
            const rowIndex = columnCounts[column]++;

            nodes.push({
                id: this.generateId(),
                type: 'text',
                x: colIndex * (columnWidth + padding) + padding,
                y: headerHeight + padding + rowIndex * (nodeHeight + padding),
                width: columnWidth - 2 * padding,
                height: nodeHeight,
                text: `**${task.title}**\n\nPriority: ${task.priority || 'Medium'}`,
                color: this.getPriorityColor(task.priority)
            });
        });

        return { nodes, edges };
    }

    createRiskMatrixCanvas(risks: Array<{ title: string; likelihood: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high' }>): CanvasData {
        const cellWidth = 250;
        const cellHeight = 200;
        const padding = 20;
        const levels = ['low', 'medium', 'high'];
        
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // Create grid cells (impact x likelihood)
        const cellCounts: Record<string, number> = {};

        levels.forEach((impact, i) => {
            levels.forEach((likelihood, j) => {
                const key = `${impact}-${likelihood}`;
                cellCounts[key] = 0;

                nodes.push({
                    id: this.generateId(),
                    type: 'group',
                    x: j * (cellWidth + padding),
                    y: (2 - i) * (cellHeight + padding), // Invert Y so high impact is at top
                    width: cellWidth,
                    height: cellHeight,
                    label: `${impact.charAt(0).toUpperCase() + impact.slice(1)} Impact / ${likelihood.charAt(0).toUpperCase() + likelihood.slice(1)} Likelihood`,
                    color: this.getRiskColor(impact, likelihood)
                });
            });
        });

        // Place risk nodes
        risks.forEach(risk => {
            const key = `${risk.impact}-${risk.likelihood}`;
            const impactIndex = levels.indexOf(risk.impact);
            const likelihoodIndex = levels.indexOf(risk.likelihood);
            const count = cellCounts[key]++;

            nodes.push({
                id: this.generateId(),
                type: 'text',
                x: likelihoodIndex * (cellWidth + padding) + padding + (count % 2) * 100,
                y: (2 - impactIndex) * (cellHeight + padding) + padding + Math.floor(count / 2) * 60,
                width: 100,
                height: 50,
                text: risk.title,
                color: this.getRiskColor(risk.impact, risk.likelihood)
            });
        });

        return { nodes, edges };
    }

    createMindMapCanvas(central: string, branches: Array<{ topic: string; subtopics: string[] }>): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];
        const centerX = 500;
        const centerY = 400;
        const branchRadius = 300;
        const subBranchRadius = 150;

        // Central node
        const centralId = this.generateId();
        nodes.push({
            id: centralId,
            type: 'text',
            x: centerX - 75,
            y: centerY - 40,
            width: 150,
            height: 80,
            text: `# ${central}`,
            color: '5' // cyan
        });

        // Branch nodes
        const angleStep = (2 * Math.PI) / branches.length;
        
        branches.forEach((branch, i) => {
            const angle = angleStep * i - Math.PI / 2;
            const branchX = centerX + Math.cos(angle) * branchRadius;
            const branchY = centerY + Math.sin(angle) * branchRadius;

            const branchId = this.generateId();
            nodes.push({
                id: branchId,
                type: 'text',
                x: branchX - 60,
                y: branchY - 30,
                width: 120,
                height: 60,
                text: `## ${branch.topic}`,
                color: String((i % 6) + 1)
            });

            // Connect to center
            edges.push({
                id: this.generateId(),
                fromNode: centralId,
                toNode: branchId,
                fromSide: this.getClosestSide(centerX, centerY, branchX, branchY),
                toSide: this.getClosestSide(branchX, branchY, centerX, centerY)
            });

            // Subtopic nodes
            const subAngleStep = (Math.PI / 3) / Math.max(branch.subtopics.length - 1, 1);
            const subStartAngle = angle - Math.PI / 6;

            branch.subtopics.forEach((subtopic, j) => {
                const subAngle = subStartAngle + subAngleStep * j;
                const subX = branchX + Math.cos(subAngle) * subBranchRadius;
                const subY = branchY + Math.sin(subAngle) * subBranchRadius;

                const subId = this.generateId();
                nodes.push({
                    id: subId,
                    type: 'text',
                    x: subX - 50,
                    y: subY - 20,
                    width: 100,
                    height: 40,
                    text: subtopic
                });

                edges.push({
                    id: this.generateId(),
                    fromNode: branchId,
                    toNode: subId,
                    fromSide: this.getClosestSide(branchX, branchY, subX, subY),
                    toSide: this.getClosestSide(subX, subY, branchX, branchY)
                });
            });
        });

        return { nodes, edges };
    }

    private mapStatusToColumn(status: string): string {
        const statusMap: Record<string, string> = {
            'pending': 'To Do',
            'todo': 'To Do',
            'in-progress': 'In Progress',
            'inprogress': 'In Progress',
            'review': 'Review',
            'completed': 'Done',
            'done': 'Done'
        };
        return statusMap[status.toLowerCase()] || 'To Do';
    }

    private getColumnColor(column: string): string {
        const colors: Record<string, string> = {
            'To Do': '2', // orange
            'In Progress': '3', // yellow
            'Review': '5', // cyan
            'Done': '4' // green
        };
        return colors[column] || '1';
    }

    private getPriorityColor(priority?: string): string {
        const colors: Record<string, string> = {
            'high': '1', // red
            'medium': '3', // yellow
            'low': '4' // green
        };
        return colors[priority?.toLowerCase() || 'medium'] || '3';
    }

    private getRiskColor(impact: string, likelihood: string): string {
        const score = (['low', 'medium', 'high'].indexOf(impact) + 1) * 
                     (['low', 'medium', 'high'].indexOf(likelihood) + 1);
        if (score >= 6) return '1'; // red - high risk
        if (score >= 3) return '2'; // orange - medium risk
        return '4'; // green - low risk
    }

    private getClosestSide(fromX: number, fromY: number, toX: number, toY: number): 'top' | 'right' | 'bottom' | 'left' {
        const dx = toX - fromX;
        const dy = toY - fromY;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'bottom' : 'top';
        }
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
