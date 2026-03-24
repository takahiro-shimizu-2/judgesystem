/**
 * GitHub Projects V2 Integration
 *
 * Local copy of the Miyabi Projects V2 client so `my-app` workflows can run
 * in this repository without depending on Miyabi's monorepo internals.
 */

import { graphql } from '@octokit/graphql';

interface ProjectV2Config {
  owner: string;
  repo: string;
  projectNumber: number;
}

interface ProjectItem {
  id: string;
  content?: {
    id?: string;
    number: number;
    title: string;
    state: string;
  };
  fieldValues?: {
    nodes: Array<{
      field: {
        name: string;
      };
      value?: string | number;
    }>;
  };
}

interface CustomField {
  id: string;
  name: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT';
  options?: Array<{
    id: string;
    name: string;
  }>;
}

interface ProjectInitializationResult {
  repository: {
    projectV2: {
      id: string;
      title: string;
    } | null;
  };
}

interface AddProjectItemResult {
  addProjectV2ItemById: {
    item: {
      id: string;
    };
  };
}

interface ProjectFieldsResult {
  node: {
    fields: {
      nodes: CustomField[];
    };
  };
}

interface ProjectItemsResult {
  node: {
    items: {
      nodes: ProjectItem[];
    };
  };
}

interface ContentNodeResult {
  repository: {
    issue?: {
      id: string;
    } | null;
    pullRequest?: {
      id: string;
    } | null;
  };
}

interface ProjectFieldValueNode {
  field: {
    name: string;
  };
  text?: string;
  number?: number;
  name?: string;
}

export class ProjectsV2Client {
  private graphqlClient: typeof graphql;
  private config: ProjectV2Config;
  private projectId?: string;

  constructor(token: string, config: ProjectV2Config) {
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
    this.config = config;
  }

  async initialize(): Promise<void> {
    const query = `
      query($owner: String!, $repo: String!, $projectNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          projectV2(number: $projectNumber) {
            id
            title
            shortDescription
          }
        }
      }
    `;

    try {
      const result = await this.graphqlClient<ProjectInitializationResult>(query, {
        owner: this.config.owner,
        repo: this.config.repo,
        projectNumber: this.config.projectNumber,
      });

      if (!result.repository.projectV2) {
        throw new Error(`Project V2 #${this.config.projectNumber} was not found for ${this.config.owner}/${this.config.repo}.`);
      }

      this.projectId = result.repository.projectV2.id;
      console.log(`✓ Connected to project: ${result.repository.projectV2.title}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not been granted the required scopes')) {
        throw new Error(
          'GitHub Token missing required scopes. Please add: read:project, write:project\n' +
          'See docs/GITHUB_TOKEN_SETUP.md for setup instructions.',
        );
      }
      throw error;
    }
  }

  async addIssueToProject(issueNodeId: string): Promise<string> {
    if (!this.projectId) {
      await this.initialize();
    }

    const mutation = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId
          contentId: $contentId
        }) {
          item {
            id
          }
        }
      }
    `;

    const result = await this.graphqlClient<AddProjectItemResult>(mutation, {
      projectId: this.projectId,
      contentId: issueNodeId,
    });

    return result.addProjectV2ItemById.item.id;
  }

  async getIssueNodeId(issueNumber: number): Promise<string> {
    return this.getContentNodeId('issue', issueNumber);
  }

  async getPullRequestNodeId(prNumber: number): Promise<string> {
    return this.getContentNodeId('pull_request', prNumber);
  }

  async getCustomFields(): Promise<CustomField[]> {
    if (!this.projectId) {
      await this.initialize();
    }

    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlClient<ProjectFieldsResult>(query, {
      projectId: this.projectId,
    });

    return result.node.fields.nodes;
  }

  async updateFieldValue(itemId: string, fieldId: string, value: string | number): Promise<void> {
    if (!this.projectId) {
      await this.initialize();
    }

    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await this.graphqlClient(mutation, {
      projectId: this.projectId,
      itemId,
      fieldId,
      value: { text: String(value) },
    });
  }

  async updateStatus(itemId: string, status: string): Promise<void> {
    if (!this.projectId) {
      await this.initialize();
    }

    const fields = await this.getCustomFields();
    const statusField = fields.find((field) => field.name === 'Status');

    if (!statusField) {
      throw new Error('Status field not found in project');
    }

    const statusOption = this.findStatusOption(statusField, status);

    if (!statusOption) {
      throw new Error(
        `Status option '${status}' not found. Available: ${statusField.options?.map((option) => option.name).join(', ')}`,
      );
    }

    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await this.graphqlClient(mutation, {
      projectId: this.projectId,
      itemId,
      fieldId: statusField.id,
      optionId: statusOption.id,
    });
  }

  async getProjectItems(): Promise<ProjectItem[]> {
    if (!this.projectId) {
      await this.initialize();
    }

    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                id
                content {
                  ... on Issue {
                    id
                    number
                    title
                    state
                  }
                  ... on PullRequest {
                    id
                    number
                    title
                    state
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                      text
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                      number
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphqlClient<ProjectItemsResult>(query, {
      projectId: this.projectId,
    });

    return result.node.items.nodes;
  }

  async generateKPIReport(): Promise<{
    totalIssues: number;
    completedIssues: number;
    avgDuration: number;
    totalCost: number;
    avgQualityScore: number;
  }> {
    const items = await this.getProjectItems();

    let totalIssues = 0;
    let completedIssues = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let totalQualityScore = 0;
    let qualityScoreCount = 0;

    for (const item of items) {
      if (!item.content) {
        continue;
      }

      totalIssues++;

      if (item.content.state === 'CLOSED') {
        completedIssues++;
      }

      if (!item.fieldValues?.nodes) {
        continue;
      }

      for (const fieldValue of item.fieldValues.nodes as ProjectFieldValueNode[]) {
        const fieldName = fieldValue.field.name;
        const value = fieldValue.text ?? fieldValue.number ?? fieldValue.name;

        if (fieldName === 'Duration' && typeof value === 'number') {
          totalDuration += value;
        } else if (fieldName === 'Cost' && typeof value === 'number') {
          totalCost += value;
        } else if (fieldName === 'Quality Score' && typeof value === 'number') {
          totalQualityScore += value;
          qualityScoreCount++;
        }
      }
    }

    return {
      totalIssues,
      completedIssues,
      avgDuration: totalIssues > 0 ? totalDuration / totalIssues : 0,
      totalCost,
      avgQualityScore: qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0,
    };
  }

  async findProjectItemByContentId(contentId: string): Promise<ProjectItem | null> {
    const items = await this.getProjectItems();
    return items.find((item) => item.content?.id === contentId) || null;
  }

  async ensureProjectItem(contentId: string) {
    const existing = await this.findProjectItemByContentId(contentId);
    if (existing) {
      return existing.id;
    }

    return this.addIssueToProject(contentId);
  }

  private async getContentNodeId(contentType: 'issue' | 'pull_request', number: number): Promise<string> {
    const contentKey = contentType === 'issue' ? 'issue' : 'pullRequest';
    const variableKey = contentType === 'issue' ? 'issueNumber' : 'prNumber';

    const query = `
      query($owner: String!, $repo: String!, $contentNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          ${contentKey}(number: $contentNumber) {
            id
          }
        }
      }
    `;

    const result = await this.graphqlClient<ContentNodeResult>(query, {
      owner: this.config.owner,
      repo: this.config.repo,
      [variableKey]: number,
      contentNumber: number,
    });

    const contentNode = contentKey === 'issue' ? result.repository.issue : result.repository.pullRequest;
    if (!contentNode?.id) {
      throw new Error(`Could not find ${contentType} #${number} in ${this.config.owner}/${this.config.repo}.`);
    }

    return contentNode.id;
  }

  private findStatusOption(field: CustomField, requestedStatus: string) {
    if (!field.options?.length) {
      return null;
    }

    const statusAliases: Record<string, string[]> = {
      'Todo': ['To Do', 'Backlog', 'Planned', 'Ready'],
      'In Progress': ['Doing', 'Active', 'Working'],
      'In Review': ['Review', 'Reviewing'],
      'Done': ['Complete', 'Completed', 'Closed'],
    };

    const candidates = [requestedStatus, ...(statusAliases[requestedStatus] || [])].map((value) =>
      value.toLowerCase(),
    );

    return field.options.find((option) => candidates.includes(option.name.toLowerCase())) || null;
  }
}
