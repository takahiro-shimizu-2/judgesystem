export interface IssuePromptInput {
  number: number;
  title: string;
  body?: string | null;
  labels?: string[];
}

export const DECOMPOSITION_PROMPT_VERSION = '2026-04-04';

export function buildIssueDecompositionPrompt(issue: IssuePromptInput) {
  const labels = issue.labels && issue.labels.length > 0 ? issue.labels.join(', ') : '(no labels)';
  const body = issue.body?.trim() || '(no body provided)';

  return [
    'You are CoordinatorAgent for the judgesystem repository.',
    'Decompose the issue into implementation-sized tasks and infer dependencies.',
    'Prefer 1-3 hour tasks, use existing issue references when present, and keep the result acyclic.',
    'Return strict JSON matching this shape:',
    '{"tasks":[{"id":"task-123","title":"...", "type":"feature|bug|refactor|docs|test|deployment|analysis|review|release","agent":"CoordinatorAgent|IssueAgent|CodeGenAgent|ReviewAgent|PRAgent|DeploymentAgent","estimatedMinutes":30,"priority":"critical|high|medium|low","dependencies":["task-122"]}],"warnings":[]}',
    `Prompt version: ${DECOMPOSITION_PROMPT_VERSION}`,
    `Issue #${issue.number}: ${issue.title}`,
    `Labels: ${labels}`,
    `Body:\n${body}`,
  ].join('\n\n');
}
