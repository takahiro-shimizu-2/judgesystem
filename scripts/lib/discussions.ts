import { graphql } from '@octokit/graphql';

interface DiscussionsConfig {
  owner: string;
  repo: string;
}

interface DiscussionCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

interface InitializeQueryResult {
  repository: {
    id: string;
    hasDiscussionsEnabled: boolean;
    discussionCategories: {
      nodes: DiscussionCategory[];
    };
  };
}

interface CreateDiscussionMutationResult {
  createDiscussion: {
    discussion: CreatedDiscussion;
  };
}

export interface CreatedDiscussion {
  id: string;
  number: number;
  title: string;
  url: string;
}

export class DiscussionsClient {
  private graphqlClient: typeof graphql;
  private config: DiscussionsConfig;
  private repositoryId?: string;
  private categories: DiscussionCategory[] = [];

  constructor(token: string, config: DiscussionsConfig) {
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
    this.config = config;
  }

  async initialize(): Promise<void> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          hasDiscussionsEnabled
          discussionCategories(first: 20) {
            nodes {
              id
              name
              description
              emoji
            }
          }
        }
      }
    `;

    const result = await this.graphqlClient<InitializeQueryResult>(query, {
      owner: this.config.owner,
      repo: this.config.repo,
    });

    if (!result.repository?.hasDiscussionsEnabled) {
      throw new Error(
        `GitHub Discussions are disabled for ${this.config.owner}/${this.config.repo}.`,
      );
    }

    this.repositoryId = result.repository.id;
    this.categories = result.repository.discussionCategories.nodes as DiscussionCategory[];
  }

  getPreferredCategory(preferredNames = ['Announcements', 'General', 'Q&A']): DiscussionCategory {
    for (const preferredName of preferredNames) {
      const matched = this.categories.find((category) => category.name === preferredName);
      if (matched) {
        return matched;
      }
    }

    if (this.categories.length === 0) {
      throw new Error('No discussion categories are configured for this repository.');
    }

    return this.categories[0];
  }

  async createDiscussion(input: {
    categoryId: string;
    title: string;
    body: string;
  }): Promise<CreatedDiscussion> {
    if (!this.repositoryId) {
      await this.initialize();
    }

    const mutation = `
      mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion {
            id
            number
            title
            url
          }
        }
      }
    `;

    const result = await this.graphqlClient<CreateDiscussionMutationResult>(mutation, {
      repositoryId: this.repositoryId,
      categoryId: input.categoryId,
      title: input.title,
      body: input.body,
    });

    return result.createDiscussion.discussion as CreatedDiscussion;
  }
}
