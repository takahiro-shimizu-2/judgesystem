import { parsePullRequestIssueLinks } from '../github/pr-issue-links.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sameNumbers(actual: number[], expected: number[]) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function main() {
  const body = `## Related
Refs #120, #121
Linked issue: #130

## Resolved
Closes #122 and owner/repo#123

## Notes
This line mentions #999 but does not intentionally link it.
Examples like \`Refs #555\` or \`Closes #556\` are documentation only and must be ignored.
`;

  const parsed = parsePullRequestIssueLinks(body);

  assert(
    sameNumbers(parsed.reviewTargets, [120, 121, 130, 122, 123]),
    `Unexpected review targets: ${parsed.reviewTargets.join(',')}`,
  );
  assert(
    sameNumbers(parsed.closingTargets, [122, 123]),
    `Unexpected closing targets: ${parsed.closingTargets.join(',')}`,
  );
  assert(
    sameNumbers(parsed.referencedTargets, [120, 121, 130]),
    `Unexpected referenced targets: ${parsed.referencedTargets.join(',')}`,
  );

  console.log('[passed] pr-issue-links');
  console.log(`  - review=${parsed.reviewTargets.join(',')}`);
  console.log(`  - closing=${parsed.closingTargets.join(',')}`);
}

main();
