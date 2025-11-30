import axios, { AxiosInstance } from 'axios';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: any; // Atlassian Document Format (ADF)
    comment?: {
      comments: Array<{
        body: any;
        author: {
          displayName: string;
        };
        created: string;
      }>;
    };
  };
}

export interface JiraTicketContent {
  key: string;
  summary: string;
  descriptionText: string;
  commentsText: string[];
  fullText: string; // Combined text for LLM processing
}

export class JiraClient {
  private client: AxiosInstance;

  constructor(config: JiraConfig) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    this.client = axios.create({
      baseURL: `${config.baseUrl}/rest/api/3`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Extract issue key from a Jira URL
   * Supports formats like:
   * - https://company.atlassian.net/browse/PROJ-123
   * - https://company.atlassian.net/jira/software/projects/PROJ/boards/1?selectedIssue=PROJ-123
   */
  static extractIssueKeyFromUrl(url: string): string | null {
    // Pattern for /browse/PROJ-123
    const browsePattern = /\/browse\/([A-Z]+-\d+)/i;
    const browseMatch = url.match(browsePattern);
    if (browseMatch) {
      return browseMatch[1].toUpperCase();
    }

    // Pattern for selectedIssue=PROJ-123
    const selectedIssuePattern = /selectedIssue=([A-Z]+-\d+)/i;
    const selectedMatch = url.match(selectedIssuePattern);
    if (selectedMatch) {
      return selectedMatch[1].toUpperCase();
    }

    // Pattern for /issues/PROJ-123
    const issuesPattern = /\/issues\/([A-Z]+-\d+)/i;
    const issuesMatch = url.match(issuesPattern);
    if (issuesMatch) {
      return issuesMatch[1].toUpperCase();
    }

    return null;
  }

  /**
   * Find Jira URLs in text (PR description)
   */
  static findJiraUrls(text: string): string[] {
    const jiraUrlPattern = /https?:\/\/[^\s]+\.atlassian\.net[^\s]*/gi;
    const matches = text.match(jiraUrlPattern) || [];
    return matches;
  }

  /**
   * Convert Atlassian Document Format (ADF) to plain text
   */
  private adfToText(adf: any): string {
    if (!adf || !adf.content) {
      return '';
    }

    const extractText = (node: any): string => {
      if (node.type === 'text') {
        return node.text || '';
      }
      
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('');
      }
      
      return '';
    };

    return adf.content.map((node: any) => {
      const text = extractText(node);
      // Add newlines after paragraphs and headings
      if (['paragraph', 'heading'].includes(node.type)) {
        return text + '\n';
      }
      return text;
    }).join('').trim();
  }

  /**
   * Fetch a Jira issue by key
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const response = await this.client.get<JiraIssue>(`/issue/${issueKey}`, {
      params: {
        fields: 'summary,description,comment',
      },
    });
    return response.data;
  }

  /**
   * Get all text content from a Jira ticket (description + comments)
   * This is used for LLM processing to find Figma links
   */
  async getTicketContent(issueKey: string): Promise<JiraTicketContent> {
    const issue = await this.getIssue(issueKey);
    
    const descriptionText = this.adfToText(issue.fields.description);
    const commentsText = (issue.fields.comment?.comments || [])
      .map(comment => this.adfToText(comment.body));

    const fullText = [
      `Ticket: ${issue.key}`,
      `Summary: ${issue.fields.summary}`,
      '',
      'Description:',
      descriptionText,
      '',
      'Comments:',
      ...commentsText.map((c, i) => `Comment ${i + 1}: ${c}`),
    ].join('\n');

    return {
      key: issue.key,
      summary: issue.fields.summary,
      descriptionText,
      commentsText,
      fullText,
    };
  }
}

