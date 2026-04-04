import * as fs from 'fs';
import * as path from 'path';

import type { AutomationAgentDefinition } from './handler-contract.js';
import { isAutomationAgentName } from './handler-contract.js';

interface Frontmatter {
  name?: string;
  description?: string;
  authority?: string;
  escalation?: string;
}

export interface ClaudeAgentLoadResult {
  agents: AutomationAgentDefinition[];
  warnings: string[];
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const FILE_NAME_AGENT_MAP: Record<string, AutomationAgentDefinition['name']> = {
  'coordinator-agent': 'CoordinatorAgent',
  'issue-agent': 'IssueAgent',
  'codegen-agent': 'CodeGenAgent',
  'review-agent': 'ReviewAgent',
  'pr-agent': 'PRAgent',
  'deployment-agent': 'DeploymentAgent',
};

export function loadClaudeAgentDefinitions(rootDir = process.cwd()): ClaudeAgentLoadResult {
  const agentsDir = path.join(rootDir, '.claude', 'agents');
  const warnings: string[] = [];

  if (!fs.existsSync(agentsDir)) {
    return {
      agents: [],
      warnings: [`Claude agent directory was not found: ${agentsDir}`],
    };
  }

  const markdownFiles = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

  const agents: AutomationAgentDefinition[] = [];

  for (const fileName of markdownFiles) {
    const result = loadClaudeAgentDefinition(path.join(agentsDir, fileName), rootDir);
    if (result.agent) {
      agents.push(result.agent);
    }
    warnings.push(...result.warnings);
  }

  return {
    agents,
    warnings,
  };
}

function loadClaudeAgentDefinition(filePath: string, rootDir: string) {
  const warnings: string[] = [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const derivedName = deriveAgentName(frontmatter.name, filePath);

  if (!derivedName) {
    warnings.push(`Skipped ${path.relative(rootDir, filePath)} because it does not map to a known automation agent.`);
    return { warnings };
  }

  const description = (frontmatter.description || '').trim();
  if (!description) {
    warnings.push(`Agent definition ${path.relative(rootDir, filePath)} is missing a description in frontmatter.`);
  }

  return {
    agent: {
      name: derivedName,
      slug: path.basename(filePath, '.md'),
      description,
      authority: cleanOptionalValue(frontmatter.authority),
      escalation: cleanOptionalValue(frontmatter.escalation),
      summary: summarizeBody(body),
      instructions: body.trim(),
      sourcePath: path.relative(rootDir, filePath),
    } satisfies AutomationAgentDefinition,
    warnings,
  };
}

function parseFrontmatter(content: string) {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {
      frontmatter: {} satisfies Frontmatter,
      body: content,
    };
  }

  const frontmatter = parseSimpleYaml(match[1]);
  return {
    frontmatter,
    body: match[2],
  };
}

function parseSimpleYaml(raw: string): Frontmatter {
  const result: Frontmatter = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (key === 'name' || key === 'description' || key === 'authority' || key === 'escalation') {
      result[key] = stripQuotes(value);
    }
  }

  return result;
}

function deriveAgentName(
  frontmatterName: string | undefined,
  filePath: string,
): AutomationAgentDefinition['name'] | undefined {
  if (frontmatterName) {
    const normalized = frontmatterName.trim();
    if (isAutomationAgentName(normalized)) {
      return normalized;
    }
  }

  const baseName = path.basename(filePath, '.md');
  return FILE_NAME_AGENT_MAP[baseName];
}

function summarizeBody(body: string) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));

  const summaryLines: string[] = [];
  for (const line of lines) {
    summaryLines.push(line);
    if (summaryLines.join(' ').length >= 160) {
      break;
    }
  }

  return summaryLines.join(' ').slice(0, 240);
}

function stripQuotes(value: string) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function cleanOptionalValue(value: string | undefined) {
  const cleaned = (value || '').trim();
  return cleaned ? cleaned : undefined;
}
