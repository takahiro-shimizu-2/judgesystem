import type { DecomposedTask, TaskDecomposition } from './llm-decomposer.js';

export interface DecompositionValidationResult {
  valid: boolean;
  tasks: DecomposedTask[];
  warnings: string[];
  errors: string[];
}

export function validateTaskDecomposition(decomposition: TaskDecomposition): DecompositionValidationResult {
  const warnings = [...decomposition.warnings];
  const errors: string[] = [];
  const knownIds = new Set(decomposition.tasks.map((task) => task.id));

  const tasks = decomposition.tasks.map((task) => {
    if (!task.title.trim()) {
      errors.push(`Task ${task.id} has an empty title.`);
    }

    const dependencies = [...new Set(task.dependencies)].filter((dependency) => {
      if (dependency === task.id) {
        errors.push(`Task ${task.id} depends on itself.`);
        return false;
      }

      if (!knownIds.has(dependency)) {
        warnings.push(`Task ${task.id} references unknown dependency ${dependency}; treating it as an external blocker.`);
        return false;
      }

      return true;
    });

    return {
      ...task,
      dependencies,
    };
  });

  const duplicateIds = findDuplicates(tasks.map((task) => task.id));
  for (const duplicateId of duplicateIds) {
    errors.push(`Duplicate task id detected: ${duplicateId}`);
  }

  if (tasks.length === 0) {
    errors.push('Task decomposition produced zero tasks.');
  }

  const augmentedTasks = errors.length === 0 ? appendQualityPipelineTasks(tasks, warnings) : tasks;

  return {
    valid: errors.length === 0,
    tasks: augmentedTasks,
    warnings,
    errors,
  };
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

function appendQualityPipelineTasks(tasks: DecomposedTask[], warnings: string[]) {
  const augmented = [...tasks];
  const knownIds = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    if (task.agent !== 'CodeGenAgent') {
      continue;
    }

    const testTask = findGeneratedDependent(augmented, task.id, 'TestAgent');
    const ensuredTestTask =
      testTask ||
      createPipelineTask({
        knownIds,
        sourceTask: task,
        suffix: 'test',
        type: 'test',
        agent: 'TestAgent',
        title: `Run tests for ${task.title}`,
        estimatedMinutes: 20,
      });
    if (!testTask) {
      augmented.push(ensuredTestTask);
      warnings.push(`Added synthetic TestAgent handoff ${ensuredTestTask.id} for ${task.id}.`);
    }

    const reviewTask = findGeneratedDependent(augmented, ensuredTestTask.id, 'ReviewAgent');
    const ensuredReviewTask =
      reviewTask ||
      createPipelineTask({
        knownIds,
        sourceTask: task,
        suffix: 'review',
        type: 'review',
        agent: 'ReviewAgent',
        title: `Review ${task.title}`,
        estimatedMinutes: 15,
        dependencyId: ensuredTestTask.id,
      });
    if (!reviewTask) {
      augmented.push(ensuredReviewTask);
      warnings.push(`Added synthetic ReviewAgent handoff ${ensuredReviewTask.id} for ${task.id}.`);
    }

    const prTask = findGeneratedDependent(augmented, ensuredReviewTask.id, 'PRAgent');
    if (!prTask) {
      const ensuredPrTask = createPipelineTask({
        knownIds,
        sourceTask: task,
        suffix: 'pr',
        type: 'release',
        agent: 'PRAgent',
        title: `Prepare PR for ${task.title}`,
        estimatedMinutes: 10,
        dependencyId: ensuredReviewTask.id,
      });
      augmented.push(ensuredPrTask);
      warnings.push(`Added synthetic PRAgent handoff ${ensuredPrTask.id} for ${task.id}.`);
    }
  }

  return augmented;
}

function findGeneratedDependent(
  tasks: DecomposedTask[],
  dependencyId: string,
  agent: DecomposedTask['agent'],
) {
  return tasks.find((task) => task.agent === agent && task.dependencies.includes(dependencyId));
}

function createPipelineTask(params: {
  knownIds: Set<string>;
  sourceTask: DecomposedTask;
  suffix: 'test' | 'review' | 'pr';
  type: DecomposedTask['type'];
  agent: DecomposedTask['agent'];
  title: string;
  estimatedMinutes: number;
  dependencyId?: string;
}): DecomposedTask {
  const dependencyId = params.dependencyId || params.sourceTask.id;
  const baseId = `${params.sourceTask.id}-${params.suffix}`;
  let candidateId = baseId;
  let counter = 2;
  while (params.knownIds.has(candidateId)) {
    candidateId = `${baseId}-${counter}`;
    counter += 1;
  }
  params.knownIds.add(candidateId);

  return {
    id: candidateId,
    issueNumber: params.sourceTask.issueNumber,
    title: params.title,
    type: params.type,
    agent: params.agent,
    estimatedMinutes: params.estimatedMinutes,
    priority: params.sourceTask.priority,
    dependencies: [dependencyId],
    rawText: params.title,
    source: 'fallback',
  };
}
