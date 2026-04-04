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

  return {
    valid: errors.length === 0,
    tasks,
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
