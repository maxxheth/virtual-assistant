import { VaultService } from './vault.js';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface CanvasNode {
    id: string;
    type: 'text' | 'file' | 'link' | 'group';
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    file?: string;
    label?: string;
    color?: string;
}

export interface CanvasEdge {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: 'top' | 'right' | 'bottom' | 'left';
    toSide?: 'top' | 'right' | 'bottom' | 'left';
    label?: string;
    color?: string;
}

export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
}

export type LayoutType = 'taskboard' | 'riskmatrix' | 'mindmap' | 'custom';

export class CanvasGenerator {
    private vault: VaultService;

    constructor(vault: VaultService) {
        this.vault = vault;
    }

    private generateId(): string {
        return randomUUID().replace(/-/g, '').substring(0, 16);
    }

    async createCanvas(
        name: string,
        layoutType: LayoutType,
        description: string,
        folder = 'Canvas'
    ): Promise<string> {
        let canvasData: CanvasData;

        switch (layoutType) {
            case 'taskboard':
                canvasData = this.generateTaskboardFromDescription(description);
                break;
            case 'riskmatrix':
                canvasData = this.generateRiskMatrixFromDescription(description);
                break;
            case 'mindmap':
                canvasData = this.generateMindMapFromDescription(description);
                break;
            case 'custom':
            default:
                canvasData = this.generateCustomCanvas(description);
                break;
        }

        const canvasPath = path.join(folder, `${this.sanitizeFilename(name)}.canvas`);
        return await this.vault.writeCanvas(canvasPath, canvasData);
    }

    private generateTaskboardFromDescription(description: string): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        const columns = ['To Do', 'In Progress', 'Review', 'Done'];
        const columnWidth = 250;
        const columnHeight = 600;
        const padding = 20;

        // Create column groups
        columns.forEach((col, i) => {
            const colId = this.generateId();
            nodes.push({
                id: colId,
                type: 'group',
                x: i * (columnWidth + padding),
                y: 0,
                width: columnWidth,
                height: columnHeight,
                label: col,
                color: this.getColumnColor(col)
            });
        });

        // Parse tasks from description
        const lines = description.split('\n').filter(l => l.trim());
        let currentColumn = 0;
        const taskCounts = [0, 0, 0, 0];

        lines.forEach((line) => {
            // Try to detect column from line content
            const lineLower = line.toLowerCase();
            if (lineLower.includes('todo') || lineLower.includes('to do') || lineLower.includes('pending')) {
                currentColumn = 0;
            } else if (lineLower.includes('in progress') || lineLower.includes('working')) {
                currentColumn = 1;
            } else if (lineLower.includes('review') || lineLower.includes('testing')) {
                currentColumn = 2;
            } else if (lineLower.includes('done') || lineLower.includes('complete')) {
                currentColumn = 3;
            }

            // Clean up task text
            let taskText = line.replace(/^[-*•]\s*/, '').trim();
            if (!taskText || taskText.length < 3) return;

            // Detect priority
            let priority = 'medium';
            let color: string | undefined;
            if (lineLower.includes('high') || lineLower.includes('urgent') || lineLower.includes('!')) {
                priority = 'high';
                color = '1'; // red
            } else if (lineLower.includes('low')) {
                priority = 'low';
                color = '4'; // green
            }

            const taskId = this.generateId();
            const nodeHeight = 80;
            
            nodes.push({
                id: taskId,
                type: 'text',
                x: currentColumn * (columnWidth + padding) + padding,
                y: 60 + taskCounts[currentColumn] * (nodeHeight + 10),
                width: columnWidth - 2 * padding,
                height: nodeHeight,
                text: `**${taskText}**\n\nPriority: ${priority}`,
                color
            });

            taskCounts[currentColumn]++;
        });

        // If no tasks were parsed, create placeholder
        if (nodes.length === 4) { // Only column groups
            nodes.push({
                id: this.generateId(),
                type: 'text',
                x: padding,
                y: 60,
                width: columnWidth - 2 * padding,
                height: 80,
                text: `Add tasks from:\n\n${description.substring(0, 100)}...`
            });
        }

        return { nodes, edges };
    }

    private generateRiskMatrixFromDescription(description: string): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        const cellWidth = 250;
        const cellHeight = 200;
        const padding = 20;
        const levels = ['low', 'medium', 'high'];

        // Create axis labels
        nodes.push({
            id: this.generateId(),
            type: 'text',
            x: -100,
            y: cellHeight + padding,
            width: 80,
            height: 40,
            text: '**Impact**'
        });

        nodes.push({
            id: this.generateId(),
            type: 'text',
            x: cellWidth + padding,
            y: 3 * (cellHeight + padding) + 20,
            width: 100,
            height: 40,
            text: '**Likelihood**'
        });

        // Create grid cells
        levels.forEach((impact, i) => {
            levels.forEach((likelihood, j) => {
                const cellId = this.generateId();
                nodes.push({
                    id: cellId,
                    type: 'group',
                    x: j * (cellWidth + padding),
                    y: (2 - i) * (cellHeight + padding),
                    width: cellWidth,
                    height: cellHeight,
                    label: `${impact.charAt(0).toUpperCase()}I / ${likelihood.charAt(0).toUpperCase()}L`,
                    color: this.getRiskColor(impact, likelihood)
                });
            });
        });

        // Parse risks from description
        const lines = description.split('\n').filter(l => l.trim());
        const riskCounts: Record<string, number> = {};

        lines.forEach((line) => {
            const lineLower = line.toLowerCase();
            let riskText = line.replace(/^[-*•]\s*/, '').trim();
            if (!riskText || riskText.length < 3) return;

            // Try to detect likelihood and impact
            let likelihood = 'medium';
            let impact = 'medium';

            if (lineLower.includes('high likelihood') || lineLower.includes('likely')) {
                likelihood = 'high';
            } else if (lineLower.includes('low likelihood') || lineLower.includes('unlikely')) {
                likelihood = 'low';
            }

            if (lineLower.includes('high impact') || lineLower.includes('critical')) {
                impact = 'high';
            } else if (lineLower.includes('low impact') || lineLower.includes('minor')) {
                impact = 'low';
            }

            const key = `${impact}-${likelihood}`;
            riskCounts[key] = (riskCounts[key] || 0);
            
            const impactIndex = levels.indexOf(impact);
            const likelihoodIndex = levels.indexOf(likelihood);

            nodes.push({
                id: this.generateId(),
                type: 'text',
                x: likelihoodIndex * (cellWidth + padding) + padding + (riskCounts[key] % 2) * 100,
                y: (2 - impactIndex) * (cellHeight + padding) + padding + Math.floor(riskCounts[key] / 2) * 50,
                width: 100,
                height: 40,
                text: riskText.substring(0, 50),
                color: this.getRiskColor(impact, likelihood)
            });

            riskCounts[key]++;
        });

        return { nodes, edges };
    }

    private generateMindMapFromDescription(description: string): CanvasData {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        const centerX = 500;
        const centerY = 400;
        const branchRadius = 300;
        const subBranchRadius = 150;

        // Parse the description to extract central theme and branches
        const lines = description.split('\n').filter(l => l.trim());
        
        // First non-empty line is the central theme
        let centralTheme = 'Central Topic';
        const branches: { topic: string; subtopics: string[] }[] = [];
        let currentBranch: { topic: string; subtopics: string[] } | null = null;

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            const isSubItem = line.startsWith('  ') || line.startsWith('\t') || trimmed.startsWith('-');
            
            if (index === 0) {
                centralTheme = trimmed.replace(/^#\s*/, '').replace(/^[-*•]\s*/, '');
            } else if (!isSubItem && trimmed.length > 2) {
                // New branch
                if (currentBranch) {
                    branches.push(currentBranch);
                }
                currentBranch = {
                    topic: trimmed.replace(/^[-*•]\s*/, '').replace(/^##?\s*/, ''),
                    subtopics: []
                };
            } else if (isSubItem && currentBranch && trimmed.length > 2) {
                // Subtopic
                currentBranch.subtopics.push(trimmed.replace(/^[-*•]\s*/, ''));
            }
        });

        if (currentBranch) {
            branches.push(currentBranch);
        }

        // Create central node
        const centralId = this.generateId();
        nodes.push({
            id: centralId,
            type: 'text',
            x: centerX - 75,
            y: centerY - 40,
            width: 150,
            height: 80,
            text: `# ${centralTheme}`,
            color: '5' // cyan
        });

        // Create branch nodes
        const angleStep = branches.length > 0 ? (2 * Math.PI) / branches.length : 0;

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

            // Create subtopic nodes
            if (branch.subtopics.length > 0) {
                const subAngleStep = (Math.PI / 3) / Math.max(branch.subtopics.length - 1, 1);
                const subStartAngle = angle - Math.PI / 6;

                branch.subtopics.slice(0, 5).forEach((subtopic, j) => { // Limit subtopics
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
                        text: subtopic.substring(0, 30)
                    });

                    edges.push({
                        id: this.generateId(),
                        fromNode: branchId,
                        toNode: subId,
                        fromSide: this.getClosestSide(branchX, branchY, subX, subY),
                        toSide: this.getClosestSide(subX, subY, branchX, branchY)
                    });
                });
            }
        });

        return { nodes, edges };
    }

    private generateCustomCanvas(description: string): CanvasData {
        // Create a simple canvas with the description as a text node
        return {
            nodes: [{
                id: this.generateId(),
                type: 'text',
                x: 0,
                y: 0,
                width: 400,
                height: 300,
                text: description
            }],
            edges: []
        };
    }

    private getColumnColor(column: string): string {
        const colors: Record<string, string> = {
            'To Do': '2',
            'In Progress': '3',
            'Review': '5',
            'Done': '4'
        };
        return colors[column] || '1';
    }

    private getRiskColor(impact: string, likelihood: string): string {
        const levels = ['low', 'medium', 'high'];
        const score = (levels.indexOf(impact) + 1) * (levels.indexOf(likelihood) + 1);
        if (score >= 6) return '1'; // red
        if (score >= 3) return '2'; // orange
        return '4'; // green
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

    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, '-')
            .substring(0, 100);
    }
}
