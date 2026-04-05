const ISSUE_REF_RE = /(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)/g;
const CLOSING_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/i;
const REFERENCE_KEYWORD_RE =
  /\b(?:ref(?:erence)?s?|related to|linked issue(?:s)?|link(?:ed)? to|part of|issue(?:s)?\s*:)\b/i;

export interface PullRequestIssueLinks {
  reviewTargets: number[];
  closingTargets: number[];
  referencedTargets: number[];
}

export function parsePullRequestIssueLinks(body: string): PullRequestIssueLinks {
  const reviewTargets = new Set<number>();
  const closingTargets = new Set<number>();
  const referencedTargets = new Set<number>();

  for (const line of body.split(/\r?\n/)) {
    const issueNumbers = extractIssueNumbers(line);
    if (issueNumbers.length === 0) {
      continue;
    }

    if (CLOSING_KEYWORD_RE.test(line)) {
      for (const issueNumber of issueNumbers) {
        closingTargets.add(issueNumber);
        reviewTargets.add(issueNumber);
      }
      continue;
    }

    if (REFERENCE_KEYWORD_RE.test(line)) {
      for (const issueNumber of issueNumbers) {
        referencedTargets.add(issueNumber);
        reviewTargets.add(issueNumber);
      }
    }
  }

  return {
    reviewTargets: Array.from(reviewTargets),
    closingTargets: Array.from(closingTargets),
    referencedTargets: Array.from(referencedTargets),
  };
}

function extractIssueNumbers(line: string) {
  const issueNumbers: number[] = [];

  for (const match of line.matchAll(ISSUE_REF_RE)) {
    const parsed = Number.parseInt(match[1] || '', 10);
    if (Number.isNaN(parsed)) {
      continue;
    }

    if (!issueNumbers.includes(parsed)) {
      issueNumbers.push(parsed);
    }
  }

  return issueNumbers;
}
