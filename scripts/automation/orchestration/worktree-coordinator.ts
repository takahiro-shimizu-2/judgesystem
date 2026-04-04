import * as path from 'path';

import type { DecomposedTask } from '../decomposition/llm-decomposer.js';
import { ensureDirectory, slugify } from '../core/utils.js';

export interface WorktreeAssignment {
  taskId: string;
  issueNumber: number;
  branchName: string;
  worktreePath: string;
  mode: 'plan-only' | 'reuse-current-tree';
}

export interface WorktreeCoordinatorOptions {
  rootDir?: string;
  useWorktree?: boolean;
  createDirectories?: boolean;
}

export class WorktreeCoordinator {
  private readonly rootDir: string;
  private readonly useWorktree: boolean;
  private readonly createDirectories: boolean;

  constructor(options: WorktreeCoordinatorOptions = {}) {
    this.rootDir = options.rootDir ?? process.cwd();
    this.useWorktree = options.useWorktree ?? false;
    this.createDirectories = options.createDirectories ?? true;
  }

  planAssignments(issueNumber: number, tasks: DecomposedTask[]) {
    const issueRoot = path.join(this.rootDir, '.ai', 'worktrees', `issue-${issueNumber}`);
    if (this.createDirectories) {
      ensureDirectory(issueRoot);
    }

    return tasks.map<WorktreeAssignment>((task) => {
      const directory = path.join(issueRoot, task.id);
      if (this.createDirectories) {
        ensureDirectory(directory);
      }

      return {
        taskId: task.id,
        issueNumber,
        branchName: `agent/issue-${issueNumber}/${slugify(task.title)}`,
        worktreePath: directory,
        mode: this.useWorktree ? 'plan-only' : 'reuse-current-tree',
      };
    });
  }
}
