import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { DecomposedTask } from '../decomposition/llm-decomposer.js';
import { ensureDirectory, slugify } from '../core/utils.js';

export type WorktreeAssignmentMode = 'reuse-current-tree' | 'git-worktree';
export type WorktreeAssignmentLifecycle = 'planned' | 'created' | 'reused' | 'cleaned';

export interface WorktreeAssignment {
  taskId: string;
  issueNumber: number;
  branchName: string;
  worktreePath: string;
  mode: WorktreeAssignmentMode;
  baseRef: string;
  lifecycle: WorktreeAssignmentLifecycle;
}

export interface WorktreeCoordinatorOptions {
  rootDir?: string;
  useWorktree?: boolean;
  createDirectories?: boolean;
  autoCleanup?: boolean;
}

interface GitWorktreeEntry {
  path: string;
  branchName?: string;
}

export class WorktreeCoordinator {
  private readonly rootDir: string;
  private readonly useWorktree: boolean;
  private readonly createDirectories: boolean;
  private readonly autoCleanup: boolean;

  constructor(options: WorktreeCoordinatorOptions = {}) {
    this.rootDir = options.rootDir ?? process.cwd();
    this.useWorktree = options.useWorktree ?? false;
    this.createDirectories = options.createDirectories ?? true;
    this.autoCleanup = options.autoCleanup ?? false;
  }

  planAssignments(issueNumber: number, tasks: DecomposedTask[]) {
    const issueRoot = path.join(this.rootDir, '.ai', 'worktrees', `issue-${issueNumber}`);
    if (this.createDirectories) {
      ensureDirectory(issueRoot);
    }

    const baseRef = this.resolveBaseRef();
    const planned = new Map<string, WorktreeAssignment>();
    const assignments = tasks.map<WorktreeAssignment>((task) => {
      const sharedAssignment = this.findSharedPipelineAssignment(task, planned);
      const branchName = sharedAssignment?.branchName || `agent/issue-${issueNumber}/${task.id}-${slugify(task.title)}`;
      const worktreePath = sharedAssignment?.worktreePath || path.join(issueRoot, task.id);

      if (this.createDirectories && !this.useWorktree) {
        ensureDirectory(worktreePath);
      }

      const assignment: WorktreeAssignment = {
        taskId: task.id,
        issueNumber,
        branchName,
        worktreePath,
        mode: this.useWorktree ? 'git-worktree' : 'reuse-current-tree',
        baseRef,
        lifecycle: 'planned',
      };
      planned.set(task.id, assignment);
      return assignment;
    });

    return assignments;
  }

  materializeAssignments(assignments: WorktreeAssignment[]): WorktreeAssignment[] {
    if (!this.useWorktree) {
      for (const assignment of assignments) {
        if (this.createDirectories) {
          ensureDirectory(assignment.worktreePath);
        }
      }
      return assignments;
    }

    const knownWorktrees = this.listGitWorktrees();
    return assignments.map<WorktreeAssignment>((assignment) => this.materializeGitWorktree(assignment, knownWorktrees));
  }

  cleanupAssignments(assignments: WorktreeAssignment[]): WorktreeAssignment[] {
    if (!this.useWorktree || !this.autoCleanup) {
      return assignments;
    }

    const removedPaths = new Set<string>();
    return assignments.map<WorktreeAssignment>((assignment) => {
      if (assignment.mode !== 'git-worktree') {
        return assignment;
      }

      const absolutePath = path.resolve(assignment.worktreePath);
      if (removedPaths.has(absolutePath)) {
        return {
          ...assignment,
          lifecycle: 'cleaned',
        };
      }

      if (!fs.existsSync(absolutePath)) {
        return assignment;
      }

      execFileSync('git', ['worktree', 'remove', absolutePath, '--force'], {
        cwd: this.rootDir,
        stdio: 'ignore',
      });
      removedPaths.add(absolutePath);

      return {
        ...assignment,
        lifecycle: 'cleaned',
      };
    });
  }

  private materializeGitWorktree(
    assignment: WorktreeAssignment,
    knownWorktrees: {
      byPath: Map<string, GitWorktreeEntry>;
      byBranchName: Map<string, GitWorktreeEntry>;
    },
  ): WorktreeAssignment {
    const requestedPath = path.resolve(assignment.worktreePath);
    const existingByPath = knownWorktrees.byPath.get(requestedPath);
    if (existingByPath) {
      return {
        ...assignment,
        worktreePath: existingByPath.path,
        lifecycle: 'reused',
      };
    }

    const existingByBranch = knownWorktrees.byBranchName.get(assignment.branchName);
    if (existingByBranch) {
      return {
        ...assignment,
        worktreePath: existingByBranch.path,
        lifecycle: 'reused',
      };
    }

    ensureDirectory(path.dirname(requestedPath));
    if (fs.existsSync(requestedPath) && fs.readdirSync(requestedPath).length > 0) {
      throw new Error(`Cannot create git worktree at ${requestedPath} because the directory is not empty.`);
    }

    if (this.localBranchExists(assignment.branchName)) {
      execFileSync('git', ['worktree', 'add', requestedPath, assignment.branchName], {
        cwd: this.rootDir,
        stdio: 'ignore',
      });
    } else {
      execFileSync('git', ['worktree', 'add', '-b', assignment.branchName, requestedPath, assignment.baseRef], {
        cwd: this.rootDir,
        stdio: 'ignore',
      });
    }

    const createdEntry = { path: requestedPath, branchName: assignment.branchName };
    knownWorktrees.byPath.set(requestedPath, createdEntry);
    knownWorktrees.byBranchName.set(assignment.branchName, createdEntry);

    return {
      ...assignment,
      worktreePath: requestedPath,
      lifecycle: 'created',
    };
  }

  private resolveBaseRef() {
    const branch = this.runGit(['branch', '--show-current']);
    return branch || 'HEAD';
  }

  private findSharedPipelineAssignment(task: DecomposedTask, assignments: Map<string, WorktreeAssignment>) {
    if (!['TestAgent', 'ReviewAgent', 'PRAgent'].includes(task.agent)) {
      return undefined;
    }

    for (const dependencyId of task.dependencies) {
      const dependencyAssignment = assignments.get(dependencyId);
      if (dependencyAssignment) {
        return dependencyAssignment;
      }
    }

    return undefined;
  }

  private localBranchExists(branchName: string) {
    const output = this.runGit(['branch', '--list', branchName]);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .some((line) => line.replace(/^\*\s*/, '') === branchName);
  }

  private listGitWorktrees() {
    const output = this.runGit(['worktree', 'list', '--porcelain']);
    const byPath = new Map<string, GitWorktreeEntry>();
    const byBranchName = new Map<string, GitWorktreeEntry>();

    let currentPath: string | undefined;
    let currentBranchName: string | undefined;
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = path.resolve(line.slice('worktree '.length).trim());
        currentBranchName = undefined;
        continue;
      }

      if (line.startsWith('branch ')) {
        currentBranchName = line.slice('branch '.length).replace('refs/heads/', '').trim();
        continue;
      }

      if (line.trim().length === 0 && currentPath) {
        const entry: GitWorktreeEntry = { path: currentPath, branchName: currentBranchName };
        byPath.set(currentPath, entry);
        if (currentBranchName) {
          byBranchName.set(currentBranchName, entry);
        }
        currentPath = undefined;
        currentBranchName = undefined;
      }
    }

    if (currentPath) {
      const entry: GitWorktreeEntry = { path: currentPath, branchName: currentBranchName };
      byPath.set(currentPath, entry);
      if (currentBranchName) {
        byBranchName.set(currentBranchName, entry);
      }
    }

    return { byPath, byBranchName };
  }

  private runGit(args: string[]) {
    try {
      return execFileSync('git', args, {
        cwd: this.rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  }
}
