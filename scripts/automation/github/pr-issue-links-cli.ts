import { parsePullRequestIssueLinks } from './pr-issue-links.js';

function main(argv = process.argv, env = process.env) {
  const mode = argv[2] || 'json';
  const body = env.PULL_REQUEST_BODY || '';
  const parsed = parsePullRequestIssueLinks(body);

  switch (mode) {
    case 'review-targets':
      console.log(parsed.reviewTargets.join(','));
      return;
    case 'closing-targets':
      console.log(parsed.closingTargets.join(','));
      return;
    case 'json':
      console.log(JSON.stringify(parsed));
      return;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
