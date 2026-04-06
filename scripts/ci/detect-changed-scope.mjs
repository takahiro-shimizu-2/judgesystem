#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const parsed = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--base') {
      parsed.base = argv[index + 1];
      index += 1;
    } else if (token === '--head') {
      parsed.head = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeWorkspacePath(workspacePath) {
  return workspacePath.replace(/\/+$/, '');
}

function collectLocalWorkspaceDependencies(pkg, workspacePathsByName) {
  const dependencySets = [
    pkg.dependencies ?? {},
    pkg.devDependencies ?? {},
    pkg.peerDependencies ?? {},
    pkg.optionalDependencies ?? {},
  ];

  const localPaths = new Set();
  for (const dependencySet of dependencySets) {
    for (const dependencyName of Object.keys(dependencySet)) {
      const localPath = workspacePathsByName.get(dependencyName);
      if (localPath) {
        localPaths.add(localPath);
      }
    }
  }

  return [...localPaths];
}

function appendOutput(outputPath, key, value) {
  fs.appendFileSync(outputPath, `${key}<<__GITHUB_OUTPUT__\n${value}\n__GITHUB_OUTPUT__\n`);
}

function loadJsonFromGit(repoRootPath, ref, filePath) {
  try {
    const raw = execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd: repoRootPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function projectWidePackageSignature(pkg) {
  if (!pkg) {
    return null;
  }

  return JSON.stringify({
    workspaces: pkg.workspaces ?? [],
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
    optionalDependencies: pkg.optionalDependencies ?? {},
    peerDependencies: pkg.peerDependencies ?? {},
    overrides: pkg.overrides ?? {},
  });
}

const args = parseArgs(process.argv);
const baseRef = args.base || process.env.CI_BASE_SHA;
const headRef = args.head || process.env.CI_HEAD_SHA || 'HEAD';

if (!baseRef) {
  console.error('Base ref is required. Pass --base or set CI_BASE_SHA.');
  process.exit(1);
}

const repoRoot = process.cwd();
const rootPackage = loadJson(path.join(repoRoot, 'package.json'));
const workspacePaths = (rootPackage.workspaces ?? []).map(normalizeWorkspacePath);

const workspaces = workspacePaths.map((workspacePath) => {
  const packageJsonPath = path.join(repoRoot, workspacePath, 'package.json');
  const pkg = loadJson(packageJsonPath);
  return {
    path: workspacePath,
    name: pkg.name ?? workspacePath,
    packageJsonPath,
    pkg,
  };
});

const workspacePathsByName = new Map(workspaces.map((workspace) => [workspace.name, workspace.path]));
const dependents = new Map(workspaces.map((workspace) => [workspace.path, new Set()]));

for (const workspace of workspaces) {
  const dependencies = collectLocalWorkspaceDependencies(workspace.pkg, workspacePathsByName);
  for (const dependencyPath of dependencies) {
    dependents.get(dependencyPath)?.add(workspace.path);
  }
}

const diffRange = `${baseRef}...${headRef}`;
const changedFiles = execFileSync('git', ['diff', '--name-only', diffRange], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .map((filePath) => filePath.trim())
  .filter(Boolean);

let runAllWorkspaces = changedFiles.includes('package-lock.json');

if (!runAllWorkspaces && changedFiles.includes('package.json')) {
  const basePackage = loadJsonFromGit(repoRoot, baseRef, 'package.json');
  const headPackage = loadJsonFromGit(repoRoot, headRef, 'package.json') ?? rootPackage;
  runAllWorkspaces =
    projectWidePackageSignature(basePackage) !== projectWidePackageSignature(headPackage);
}

const directWorkspaceChanges = new Set();
for (const changedFile of changedFiles) {
  for (const workspace of workspaces) {
    if (changedFile === workspace.path || changedFile.startsWith(`${workspace.path}/`)) {
      directWorkspaceChanges.add(workspace.path);
    }
  }
}

const selectedWorkspaces = new Set(runAllWorkspaces ? workspacePaths : [...directWorkspaceChanges]);
const queue = [...selectedWorkspaces];

while (queue.length > 0) {
  const current = queue.shift();
  for (const dependentPath of dependents.get(current) ?? []) {
    if (!selectedWorkspaces.has(dependentPath)) {
      selectedWorkspaces.add(dependentPath);
      queue.push(dependentPath);
    }
  }
}

const workspaceMatrix = [...selectedWorkspaces]
  .sort()
  .map((workspacePath) => ({
    path: workspacePath,
    lockfile: `${workspacePath}/package-lock.json`,
  }));

const outputs = {
  changed_files_json: JSON.stringify(changedFiles),
  workspace_matrix: JSON.stringify(workspaceMatrix),
  has_workspace_changes: workspaceMatrix.length > 0 ? 'true' : 'false',
  workflow_changed: changedFiles.some((filePath) => filePath.startsWith('.github/workflows/')) ? 'true' : 'false',
  migration_changed: changedFiles.some((filePath) => filePath.startsWith('db/migrations/')) ? 'true' : 'false',
  python_changed:
    changedFiles.some(
      (filePath) => filePath.startsWith('packages/engine/') || filePath.startsWith('db/scripts/'),
    )
      ? 'true'
      : 'false',
  diff_range: diffRange,
};

if (process.env.GITHUB_OUTPUT) {
  for (const [key, value] of Object.entries(outputs)) {
    appendOutput(process.env.GITHUB_OUTPUT, key, value);
  }
} else {
  process.stdout.write(JSON.stringify(outputs, null, 2));
}
