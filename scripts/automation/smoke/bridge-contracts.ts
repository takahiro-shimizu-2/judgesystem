import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function writeExecutable(filePath: string, body: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, body, 'utf8');
  chmodSync(filePath, 0o755);
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runBash(command: string, env: Record<string, string>) {
  return execFileSync('bash', ['-lc', command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runRgWithoutMatches(pattern: string, targets: string[]) {
  try {
    const output = execFileSync('rg', ['-n', pattern, ...targets], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    throw new Error(`Unexpected bridge reference(s) found:\n${output}`);
  } catch (error) {
    const rgError = error as NodeJS.ErrnoException & { status?: number; stdout?: string };
    if (rgError.status === 1) {
      return;
    }

    throw error;
  }
}

async function callMiyabiStatus(options: { cwd: string; env?: Record<string, string> }) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [miyabiServerPath],
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    } as Record<string, string>,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'bridge-smoke', version: '1.0.0' },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);
    const result = (await client.callTool({
      name: 'miyabi__get_status',
      arguments: {},
    })) as {
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    };
    const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
    return text;
  } finally {
    await transport.close();
  }
}

const repoRoot = process.cwd();
const commonScriptPath = path.join(repoRoot, 'scripts/context-impact/common.sh');
const miyabiServerPath = path.join(repoRoot, '.claude/mcp-servers/miyabi-integration.js');

async function main() {
  const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'judgesystem-bridge-smoke-'));

  try {
    runRuntimeIsolationSmoke();
    runContextImpactBridgeSmoke(sandboxRoot);
    runAgentSkillBusBridgeSmoke(sandboxRoot);
    await runMiyabiBridgeSmoke(sandboxRoot);
  } finally {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

function runRuntimeIsolationSmoke() {
  runRgWithoutMatches('MIYABI_|miyabi__|agent-skill-bus|CONTEXT_AND_IMPACT_ROOT|context-and-impact|AGENT_SKILL_BUS_|gitnexus-stable-ops', [
    'scripts/automation/adapters',
    'scripts/automation/agents',
    'scripts/automation/core',
    'scripts/automation/decomposition',
    'scripts/automation/deploy',
    'scripts/automation/github',
    'scripts/automation/omega',
    'scripts/automation/orchestration',
    'scripts/automation/planning',
    'scripts/automation/reporting',
    'scripts/automation/state',
    'scripts/automation/sync',
    'scripts/automation/water-spider',
    'scripts/agents-parallel-exec.ts',
    'scripts/autonomous-agent-summary.ts',
    'scripts/water-spider.ts',
    '.github/workflows/autonomous-agent.yml',
    '.github/workflows/autonomous-deploy-execute.yml',
  ]);

  console.log('[passed] bridge-runtime-isolation');
  console.log('  - runtime/workflow entrypoints remain free of external bridge references');
}

function runContextImpactBridgeSmoke(sandboxRoot: string) {
  const projectRoot = path.join(sandboxRoot, 'repo');
  const siblingRoot = path.join(sandboxRoot, 'context-and-impact');
  const overrideRoot = path.join(sandboxRoot, 'context-and-impact-override');
  const missingProjectRoot = path.join(sandboxRoot, 'isolated-context', 'repo');

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(missingProjectRoot, { recursive: true });
  writeJson(path.join(siblingRoot, 'package.json'), { name: 'context-and-impact-smoke' });
  writeJson(path.join(overrideRoot, 'package.json'), { name: 'context-and-impact-override' });
  writeExecutable(path.join(overrideRoot, 'src/cli/l1-keyword-search.sh'), '#!/usr/bin/env bash\necho "l1-override:$1"\n');
  writeExecutable(
    path.join(overrideRoot, 'src/quality/ensemble_judge.py'),
    '#!/usr/bin/env python3\nimport sys\nprint("quality-override:" + " ".join(sys.argv[1:]))\n',
  );
  writeExecutable(
    path.join(overrideRoot, 'src/routing/multi_classifier.py'),
    '#!/usr/bin/env python3\nimport sys\nprint("classify-override:" + " ".join(sys.argv[1:]))\n',
  );

  const overrideResolved = runBash(`source "${commonScriptPath}"; resolve_context_and_impact_root`, {
    PROJECT_ROOT: projectRoot,
    CONTEXT_AND_IMPACT_ROOT: overrideRoot,
  }).trim();
  assert(
    path.resolve(overrideResolved) === path.resolve(overrideRoot),
    `Expected CONTEXT_AND_IMPACT_ROOT override, got ${overrideResolved}.`,
  );

  const siblingResolved = runBash(`source "${commonScriptPath}"; resolve_context_and_impact_root`, {
    PROJECT_ROOT: projectRoot,
  }).trim();
  assert(
    path.resolve(siblingResolved) === path.resolve(siblingRoot),
    `Expected sibling context-and-impact fallback, got ${siblingResolved}.`,
  );

  const l1Output = runBash('bash scripts/context-impact/l1-search.sh "eligibility"', {
    CONTEXT_AND_IMPACT_ROOT: overrideRoot,
  }).trim();
  assert(l1Output === 'l1-override:eligibility', `Unexpected l1 bridge output: ${l1Output}`);

  const qualityOutput = runBash('bash scripts/context-impact/quality-gate.sh --task smoke', {
    CONTEXT_AND_IMPACT_ROOT: overrideRoot,
  }).trim();
  assert(
    qualityOutput === 'quality-override:--task smoke',
    `Unexpected quality bridge output: ${qualityOutput}`,
  );

  const classifyOutput = runBash('bash scripts/context-impact/classify-task.sh --task smoke', {
    CONTEXT_AND_IMPACT_ROOT: overrideRoot,
  }).trim();
  assert(
    classifyOutput === 'classify-override:--task smoke',
    `Unexpected classify bridge output: ${classifyOutput}`,
  );

  try {
    runBash(`source "${commonScriptPath}"; exec_context_and_impact_script "src/cli/l1-keyword-search.sh"`, {
      PROJECT_ROOT: missingProjectRoot,
    });
    throw new Error('Expected missing context-and-impact bridge to fail.');
  } catch (error) {
    const bridgeError = error as NodeJS.ErrnoException & { stderr?: string; status?: number };
    assert(bridgeError.status === 1, `Expected exit code 1, got ${bridgeError.status}.`);
    assert(
      bridgeError.stderr?.includes('context-and-impact is not available.'),
      'Missing context-and-impact bridge did not report the explicit bridge error.',
    );
  }

  console.log('[passed] context-impact-bridge');
  console.log(`  - override=${path.basename(overrideRoot)}`);
  console.log(`  - sibling=${path.basename(siblingRoot)}`);
}

function runAgentSkillBusBridgeSmoke(sandboxRoot: string) {
  const projectRoot = path.join(sandboxRoot, 'repo');
  const missingProjectRoot = path.join(sandboxRoot, 'isolated-skill-bus', 'repo');
  const commandStub = path.join(sandboxRoot, 'bin', 'agent-skill-bus-stub');
  const rootStub = path.join(sandboxRoot, 'agent-skill-bus-root');

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(missingProjectRoot, { recursive: true });
  writeExecutable(commandStub, '#!/usr/bin/env bash\necho "skill-bus-bin:$*"\n');
  writeJson(path.join(rootStub, 'package.json'), { name: 'agent-skill-bus-root' });
  writeExecutable(path.join(rootStub, 'node_modules/.bin/agent-skill-bus'), '#!/usr/bin/env bash\necho "skill-bus-root:$*"\n');

  const dashboardOutput = runBash('bash scripts/context-impact/pipeline-dashboard.sh summary', {
    AGENT_SKILL_BUS_BIN: commandStub,
  });
  assert(
    dashboardOutput.trim() === 'skill-bus-bin:dashboard summary',
    `Unexpected dashboard bridge output: ${dashboardOutput}`,
  );

  const recordOutput = runBash('bash scripts/context-impact/record-run.sh "Bridge smoke" success 0.9', {
    AGENT_SKILL_BUS_ROOT: rootStub,
  });
  assert(
    recordOutput.includes('skill-bus-root:record-run --agent judgesystem --skill context-and-impact --task Bridge smoke --result success --score 0.9'),
    `Unexpected record-run bridge output: ${recordOutput}`,
  );

  try {
    runBash(`source "${commonScriptPath}"; exec_agent_skill_bus dashboard`, {
      PROJECT_ROOT: missingProjectRoot,
    });
    throw new Error('Expected missing agent-skill-bus bridge to fail.');
  } catch (error) {
    const bridgeError = error as NodeJS.ErrnoException & { stderr?: string; status?: number };
    assert(bridgeError.status === 1, `Expected exit code 1, got ${bridgeError.status}.`);
    assert(
      bridgeError.stderr?.includes('agent-skill-bus is not installed locally.'),
      'Missing agent-skill-bus bridge did not report the explicit bridge error.',
    );
  }

  console.log('[passed] agent-skill-bus-bridge');
  console.log(`  - bin=${path.basename(commandStub)}`);
  console.log(`  - root=${path.basename(rootStub)}`);
}

async function runMiyabiBridgeSmoke(sandboxRoot: string) {
  const projectRoot = path.join(sandboxRoot, 'miyabi-repo');
  const localProjectRoot = path.join(sandboxRoot, 'miyabi-local-repo');
  const siblingParent = path.join(sandboxRoot, 'miyabi-sibling-parent');
  const siblingProjectRoot = path.join(siblingParent, 'repo');
  const siblingCliRoot = path.join(siblingParent, 'Miyabi', 'packages', 'cli');
  const cliStub = path.join(sandboxRoot, 'bin', 'miyabi-stub');
  const rootStub = path.join(sandboxRoot, 'miyabi-root');

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(localProjectRoot, { recursive: true });
  mkdirSync(siblingProjectRoot, { recursive: true });
  writeExecutable(cliStub, '#!/usr/bin/env bash\necho "miyabi-cli:$*"\n');
  writeJson(path.join(rootStub, 'package.json'), { name: 'miyabi-root' });
  writeExecutable(path.join(localProjectRoot, 'node_modules/.bin/miyabi'), '#!/usr/bin/env bash\necho "miyabi-local:$*"\n');
  writeJson(path.join(siblingCliRoot, 'package.json'), { name: 'miyabi-sibling-cli' });

  const cliStatus = await callMiyabiStatus({
    cwd: projectRoot,
    env: {
      MIYABI_CLI: cliStub,
    },
  });
  assert(cliStatus.includes(`Miyabi CLI: MIYABI_CLI=${cliStub}`), `Unexpected MIYABI_CLI status: ${cliStatus}`);

  const rootStatus = await callMiyabiStatus({
    cwd: projectRoot,
    env: {
      MIYABI_ROOT: rootStub,
    },
  });
  assert(rootStatus.includes(`Miyabi CLI: MIYABI_ROOT=${rootStub}`), `Unexpected MIYABI_ROOT status: ${rootStatus}`);

  const localStatus = await callMiyabiStatus({
    cwd: localProjectRoot,
  });
  assert(localStatus.includes('Miyabi CLI: node_modules/.bin/miyabi'), `Unexpected local miyabi status: ${localStatus}`);

  const siblingStatus = await callMiyabiStatus({
    cwd: siblingProjectRoot,
  });
  assert(
    siblingStatus.includes('Miyabi CLI: ../Miyabi/packages/cli'),
    `Unexpected sibling miyabi status: ${siblingStatus}`,
  );

  const unavailableStatus = await callMiyabiStatus({
    cwd: projectRoot,
  });
  assert(
    unavailableStatus.includes('Miyabi CLI: 未検出'),
    `Unexpected unavailable miyabi status: ${unavailableStatus}`,
  );

  console.log('[passed] miyabi-bridge');
  console.log(`  - cli=${path.basename(cliStub)}`);
  console.log(`  - root=${path.basename(rootStub)}`);
  console.log('  - local=node_modules/.bin/miyabi');
  console.log('  - sibling=../Miyabi/packages/cli');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
