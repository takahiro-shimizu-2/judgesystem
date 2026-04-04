import { Octokit } from '@octokit/rest';

interface ReplaceIssueLabelsByPrefixOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  existingLabels: string[];
  prefix: string;
  nextLabels: string[];
}

export async function replaceIssueLabelsByPrefix({
  octokit,
  owner,
  repo,
  issueNumber,
  existingLabels,
  prefix,
  nextLabels,
}: ReplaceIssueLabelsByPrefixOptions) {
  for (const label of existingLabels.filter((value) => value.includes(prefix))) {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: label,
    });
  }

  if (nextLabels.length === 0) {
    return;
  }

  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: nextLabels,
  });
}
