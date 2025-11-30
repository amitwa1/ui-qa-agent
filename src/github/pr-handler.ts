import * as github from '@actions/github';
import axios from 'axios';

type Octokit = ReturnType<typeof github.getOctokit>;

export interface PRInfo {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body: string;
  headSha: string;
}

export interface PRComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  imageUrls: string[];
}

export interface ExtractedImage {
  url: string;
  alt: string;
}

export class PRHandler {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = github.getOctokit(token);
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get PR information
   */
  async getPRInfo(pullNumber: number): Promise<PRInfo> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
    });

    return {
      owner: this.owner,
      repo: this.repo,
      pullNumber,
      title: pr.title,
      body: pr.body || '',
      headSha: pr.head.sha,
    };
  }

  /**
   * Extract image URLs from markdown text
   * Looks for patterns like:
   * - ![alt](url)
   * - <img src="url">
   * - Direct GitHub user-content URLs
   */
  static extractImagesFromMarkdown(text: string): ExtractedImage[] {
    const images: ExtractedImage[] = [];
    
    // Markdown image pattern: ![alt](url)
    const mdImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = mdImagePattern.exec(text)) !== null) {
      images.push({
        alt: mdMatch[1],
        url: mdMatch[2],
      });
    }

    // HTML img tag pattern
    const htmlImgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlImgPattern.exec(text)) !== null) {
      images.push({
        alt: '',
        url: htmlMatch[1],
      });
    }

    // GitHub user-content URLs (direct paste)
    const githubImagePattern = /https:\/\/(?:user-images\.githubusercontent\.com|github\.com\/[^/]+\/[^/]+\/assets)\/[^\s"')]+/g;
    let ghMatch: RegExpExecArray | null;
    while ((ghMatch = githubImagePattern.exec(text)) !== null) {
      // Check if not already captured
      if (!images.some(img => img.url === ghMatch![0])) {
        images.push({
          alt: '',
          url: ghMatch[0],
        });
      }
    }

    return images;
  }

  /**
   * Get all comments on a PR
   */
  async getPRComments(pullNumber: number): Promise<PRComment[]> {
    const { data: comments } = await this.octokit.rest.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: pullNumber,
    });

    return comments.map(comment => ({
      id: comment.id,
      body: comment.body || '',
      user: comment.user?.login || 'unknown',
      createdAt: comment.created_at,
      imageUrls: PRHandler.extractImagesFromMarkdown(comment.body || '').map(img => img.url),
    }));
  }

  /**
   * Find comments with screenshots (images)
   */
  async findScreenshotComments(pullNumber: number): Promise<PRComment[]> {
    const comments = await this.getPRComments(pullNumber);
    return comments.filter(comment => comment.imageUrls.length > 0);
  }

  /**
   * Post a comment on the PR
   */
  async postComment(pullNumber: number, body: string): Promise<number> {
    const { data: comment } = await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: pullNumber,
      body,
    });

    return comment.id;
  }

  /**
   * Update an existing comment
   */
  async updateComment(commentId: number, body: string): Promise<void> {
    await this.octokit.rest.issues.updateComment({
      owner: this.owner,
      repo: this.repo,
      comment_id: commentId,
      body,
    });
  }

  /**
   * Find an existing comment by a marker string
   */
  async findCommentByMarker(pullNumber: number, marker: string): Promise<PRComment | null> {
    const comments = await this.getPRComments(pullNumber);
    return comments.find(comment => comment.body.includes(marker)) || null;
  }

  /**
   * Post or update a comment (update if exists with marker, otherwise create)
   */
  async postOrUpdateComment(pullNumber: number, body: string, marker: string): Promise<number> {
    const existingComment = await this.findCommentByMarker(pullNumber, marker);
    
    if (existingComment) {
      await this.updateComment(existingComment.id, body);
      return existingComment.id;
    }
    
    return this.postComment(pullNumber, body);
  }

  /**
   * Post a request for screenshots
   */
  async requestScreenshots(pullNumber: number, figmaLinks: string[]): Promise<number> {
    const figmaListItems = figmaLinks.map(link => `- ${link}`).join('\n');
    
    const marker = '## 📸 UI QA: Screenshots Required';
    const body = `${marker}

I found the following Figma design link(s) in the linked Jira ticket:

${figmaListItems}

**Please upload screenshots of your implementation** by replying to this comment with images.

### How to add screenshots:
1. Take screenshots of your implemented UI
2. Paste or drag-and-drop them into a reply to this comment
3. I'll automatically compare them against the Figma designs

---
*UI QA Agent will analyze your screenshots and provide feedback.*`;

    return this.postOrUpdateComment(pullNumber, body, marker);
  }

  /**
   * Post comparison results
   */
  async postComparisonResults(
    pullNumber: number,
    results: Array<{
      figmaUrl: string;
      screenshotUrl: string;
      overallMatch: 'pass' | 'fail' | 'warning';
      matchPercentage: number;
      summary: string;
      issues: Array<{
        severity: string;
        category: string;
        description: string;
        location: string;
      }>;
      recommendations: string[];
    }>
  ): Promise<number> {
    const statusEmoji = {
      pass: '✅',
      warning: '⚠️',
      fail: '❌',
    };

    const severityEmoji = {
      critical: '🔴',
      major: '🟠',
      minor: '🟡',
    };

    const marker = '## 🔍 UI QA Analysis Results';
    let body = `${marker}\n\n`;

    // Overall summary
    const passCount = results.filter(r => r.overallMatch === 'pass').length;
    const failCount = results.filter(r => r.overallMatch === 'fail').length;
    const warningCount = results.filter(r => r.overallMatch === 'warning').length;

    if (failCount > 0) {
      body += `### Overall Status: ❌ Issues Found\n\n`;
    } else if (warningCount > 0) {
      body += `### Overall Status: ⚠️ Minor Issues\n\n`;
    } else {
      body += `### Overall Status: ✅ All Checks Passed\n\n`;
    }

    body += `| Status | Count |\n|--------|-------|\n`;
    body += `| ✅ Pass | ${passCount} |\n`;
    body += `| ⚠️ Warning | ${warningCount} |\n`;
    body += `| ❌ Fail | ${failCount} |\n\n`;

    // Individual results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const emoji = statusEmoji[result.overallMatch];

      body += `<details>\n`;
      body += `<summary>${emoji} Comparison ${i + 1}: ${result.matchPercentage}% match</summary>\n\n`;
      body += `**Figma Design:** ${result.figmaUrl}\n\n`;
      body += `**Summary:** ${result.summary}\n\n`;

      if (result.issues.length > 0) {
        body += `#### Issues Found:\n\n`;
        body += `| Severity | Category | Description | Location |\n`;
        body += `|----------|----------|-------------|----------|\n`;
        
        for (const issue of result.issues) {
          const sevEmoji = severityEmoji[issue.severity as keyof typeof severityEmoji] || '⚪';
          body += `| ${sevEmoji} ${issue.severity} | ${issue.category} | ${issue.description} | ${issue.location} |\n`;
        }
        body += '\n';
      }

      if (result.recommendations.length > 0) {
        body += `#### Recommendations:\n\n`;
        for (const rec of result.recommendations) {
          body += `- ${rec}\n`;
        }
        body += '\n';
      }

      body += `</details>\n\n`;
    }

    body += `---\n*Analysis performed by UI QA Agent*`;

    return this.postOrUpdateComment(pullNumber, body, marker);
  }

  /**
   * Download an image from a URL and return as base64
   */
  async downloadImageAsBase64(imageUrl: string): Promise<string> {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data).toString('base64');
  }

  /**
   * Set commit status
   */
  async setCommitStatus(
    sha: string,
    state: 'pending' | 'success' | 'failure' | 'error',
    description: string,
    context: string = 'UI QA Agent'
  ): Promise<void> {
    await this.octokit.rest.repos.createCommitStatus({
      owner: this.owner,
      repo: this.repo,
      sha,
      state,
      description,
      context,
    });
  }
}

