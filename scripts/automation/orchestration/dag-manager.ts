import type { DecomposedTask } from '../decomposition/llm-decomposer.js';

export interface TaskGraphEdge {
  from: string;
  to: string;
}

export interface TaskDag {
  nodes: DecomposedTask[];
  edges: TaskGraphEdge[];
  levels: string[][];
  hasCycles: boolean;
  cyclePaths: string[][];
  maxParallelism: number;
}

export function buildTaskDag(tasks: DecomposedTask[]): TaskDag {
  const nodeOrder = new Map(tasks.map((task, index) => [task.id, index]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const edges: TaskGraphEdge[] = [];

  for (const task of tasks) {
    adjacency.set(task.id, []);
    indegree.set(task.id, 0);
  }

  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!adjacency.has(dependency)) {
        continue;
      }

      adjacency.get(dependency)!.push(task.id);
      indegree.set(task.id, (indegree.get(task.id) || 0) + 1);
      edges.push({ from: dependency, to: task.id });
    }
  }

  const levels: string[][] = [];
  let remaining = [...tasks.filter((task) => (indegree.get(task.id) || 0) === 0).map((task) => task.id)];
  let visitedCount = 0;

  while (remaining.length > 0) {
    remaining.sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0));
    levels.push(remaining);

    const nextLevel: string[] = [];
    for (const nodeId of remaining) {
      visitedCount += 1;
      for (const downstream of adjacency.get(nodeId) || []) {
        const nextDegree = (indegree.get(downstream) || 0) - 1;
        indegree.set(downstream, nextDegree);
        if (nextDegree === 0) {
          nextLevel.push(downstream);
        }
      }
    }

    remaining = nextLevel;
  }

  const hasCycles = visitedCount !== tasks.length;

  return {
    nodes: tasks,
    edges,
    levels,
    hasCycles,
    cyclePaths: hasCycles ? findCyclePaths(tasks) : [],
    maxParallelism: levels.reduce((max, level) => Math.max(max, level.length), 0),
  };
}

function findCyclePaths(tasks: DecomposedTask[]) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(taskId: string, trail: string[]) {
    if (stack.has(taskId)) {
      const startIndex = trail.indexOf(taskId);
      cycles.push([...trail.slice(startIndex), taskId]);
      return;
    }

    if (visited.has(taskId)) {
      return;
    }

    visited.add(taskId);
    stack.add(taskId);

    const task = taskMap.get(taskId);
    for (const dependency of task?.dependencies || []) {
      if (taskMap.has(dependency)) {
        dfs(dependency, [...trail, dependency]);
      }
    }

    stack.delete(taskId);
  }

  for (const task of tasks) {
    dfs(task.id, [task.id]);
  }

  return cycles;
}
