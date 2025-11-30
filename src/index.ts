import * as core from '@actions/core';
import * as github from '@actions/github';
import { JiraClient } from './jira/client';
import { FigmaClient } from './figma/client';
import { BedrockClient, UIComparisonResult } from './bedrock/client';
import { PRHandler } from './github/pr-handler';
import { downloadImageAsBase64 } from './utils/image-utils';

type ActionMode = 'detect' | 'request' | 'analyze';

interface ActionConfig {
  mode: ActionMode;
  githubToken: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  figmaAccessToken?: string;
  // Bedrock API Key auth (recommended)
  bedrockApiKey?: string;
  bedrockRegion?: string;
  bedrockModelId?: string;
  // Legacy AWS credentials auth
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  prNumber?: number;
  commentId?: number;
  figmaLinks?: string[];
}

function getConfig(): ActionConfig {
  const mode = core.getInput('mode', { required: true }) as ActionMode;
  
  const config: ActionConfig = {
    mode,
    githubToken: core.getInput('github-token', { required: true }),
    jiraBaseUrl: core.getInput('jira-base-url'),
    jiraEmail: core.getInput('jira-email'),
    jiraApiToken: core.getInput('jira-api-token'),
    figmaAccessToken: core.getInput('figma-access-token'),
    // Bedrock API Key auth (recommended)
    bedrockApiKey: core.getInput('bedrock-api-key'),
    bedrockRegion: core.getInput('bedrock-region') || 'us-east-1',
    bedrockModelId: core.getInput('bedrock-model-id') || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    // Legacy AWS credentials auth
    awsAccessKeyId: core.getInput('aws-access-key-id'),
    awsSecretAccessKey: core.getInput('aws-secret-access-key'),
  };

  const prNumber = core.getInput('pr-number');
  if (prNumber) {
    config.prNumber = parseInt(prNumber, 10);
  }

  const commentId = core.getInput('comment-id');
  if (commentId) {
    config.commentId = parseInt(commentId, 10);
  }

  const figmaLinksInput = core.getInput('figma-links');
  if (figmaLinksInput) {
    try {
      config.figmaLinks = JSON.parse(figmaLinksInput);
    } catch {
      config.figmaLinks = figmaLinksInput.split(',').map(s => s.trim());
    }
  }

  return config;
}

/**
 * Mode: detect
 * Triggered on PR open/sync
 * Finds Jira links in PR description, fetches Jira content, extracts Figma links
 */
async function runDetectMode(config: ActionConfig): Promise<void> {
  const context = github.context;
  const { owner, repo } = context.repo;
  
  if (!context.payload.pull_request) {
    throw new Error('This action must be run on a pull_request event');
  }

  const pullNumber = context.payload.pull_request.number;
  const prBody = context.payload.pull_request.body || '';

  core.info(`Analyzing PR #${pullNumber} for Jira/Figma links...`);
  core.info(`PR Body length: ${prBody.length} characters`);
  core.info(`PR Body preview: ${prBody.substring(0, 500)}...`);

  const prHandler = new PRHandler(config.githubToken, owner, repo);

  // Find Jira URLs in PR description
  const jiraUrls = JiraClient.findJiraUrls(prBody);
  
  core.info(`Raw Jira URLs found: ${JSON.stringify(jiraUrls)}`);
  
  if (jiraUrls.length === 0) {
    core.info('No Jira URLs found in PR description');
    core.info('Looking for atlassian.net in body...');
    core.info(`Contains "atlassian.net": ${prBody.includes('atlassian.net')}`);
    core.info(`Contains "jira": ${prBody.toLowerCase().includes('jira')}`);
    core.setOutput('has_figma_links', 'false');
    core.setOutput('figma_links', '[]');
    core.setOutput('jira_ticket', '');
    return;
  }

  core.info(`Found ${jiraUrls.length} Jira URL(s): ${jiraUrls.join(', ')}`);
  
  // Log extracted issue keys
  for (const url of jiraUrls) {
    const key = JiraClient.extractIssueKeyFromUrl(url);
    core.info(`URL: ${url} -> Issue Key: ${key || 'NOT FOUND'}`);
  }

  // Initialize clients
  if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiToken) {
    throw new Error('Jira credentials are required for detect mode');
  }

  const jiraClient = new JiraClient({
    baseUrl: config.jiraBaseUrl,
    email: config.jiraEmail,
    apiToken: config.jiraApiToken,
  });

  const bedrockClient = new BedrockClient({
    apiKey: config.bedrockApiKey,
    region: config.bedrockRegion || 'us-east-1',
    modelId: config.bedrockModelId,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  // Extract issue keys and fetch content
  const allFigmaLinks: string[] = [];
  let jiraTicketKey = '';

  for (const jiraUrl of jiraUrls) {
    const issueKey = JiraClient.extractIssueKeyFromUrl(jiraUrl);
    if (!issueKey) {
      core.warning(`Could not extract issue key from: ${jiraUrl}`);
      continue;
    }

    jiraTicketKey = issueKey;
    core.info(`Fetching Jira ticket: ${issueKey}`);

    try {
      const ticketContent = await jiraClient.getTicketContent(issueKey);
      core.info(`Ticket content length: ${ticketContent.fullText.length} chars`);
      core.info(`=== JIRA TICKET CONTENT START ===`);
      core.info(ticketContent.fullText);
      core.info(`=== JIRA TICKET CONTENT END ===`);

      // Use LLM to extract Figma links
      core.info('Using LLM to extract Figma links...');
      const extractionResult = await bedrockClient.extractFigmaLinks(ticketContent.fullText);

      core.info(`Extraction result: ${JSON.stringify(extractionResult)}`);

      if (extractionResult.figmaLinks.length > 0) {
        // Validate each link
        for (const link of extractionResult.figmaLinks) {
          if (FigmaClient.isFigmaUrl(link)) {
            allFigmaLinks.push(link);
          }
        }
      }
    } catch (error) {
      core.warning(`Error processing Jira ticket ${issueKey}: ${error}`);
    }
  }

  // Remove duplicates
  const uniqueFigmaLinks = [...new Set(allFigmaLinks)];

  core.info(`Found ${uniqueFigmaLinks.length} Figma link(s)`);

  core.setOutput('has_figma_links', uniqueFigmaLinks.length > 0 ? 'true' : 'false');
  core.setOutput('figma_links', JSON.stringify(uniqueFigmaLinks));
  core.setOutput('jira_ticket', jiraTicketKey);

  // Update commit status
  const sha = context.payload.pull_request.head.sha;
  if (uniqueFigmaLinks.length > 0) {
    await prHandler.setCommitStatus(
      sha,
      'pending',
      `Found ${uniqueFigmaLinks.length} Figma design(s) - awaiting screenshots`,
      'UI QA Agent'
    );
  }
}

/**
 * Mode: request
 * Posts a comment requesting screenshots
 */
async function runRequestMode(config: ActionConfig): Promise<void> {
  const context = github.context;
  const { owner, repo } = context.repo;

  if (!context.payload.pull_request) {
    throw new Error('This action must be run on a pull_request event');
  }

  const pullNumber = context.payload.pull_request.number;
  const figmaLinks = config.figmaLinks || [];

  if (figmaLinks.length === 0) {
    core.info('No Figma links provided, skipping screenshot request');
    return;
  }

  const prHandler = new PRHandler(config.githubToken, owner, repo);
  
  core.info(`Requesting screenshots for ${figmaLinks.length} Figma design(s)...`);
  const commentId = await prHandler.requestScreenshots(pullNumber, figmaLinks);
  
  core.info(`Posted screenshot request comment: ${commentId}`);
  core.setOutput('comment_id', commentId.toString());
}

/**
 * Mode: analyze
 * Triggered when a comment with images is posted
 * Compares screenshots against Figma designs
 */
async function runAnalyzeMode(config: ActionConfig): Promise<void> {
  const context = github.context;
  const { owner, repo } = context.repo;

  const pullNumber = config.prNumber || (context.payload.issue?.number);
  if (!pullNumber) {
    throw new Error('Could not determine PR number');
  }

  core.info(`Analyzing screenshots on PR #${pullNumber}...`);

  // Initialize clients
  if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiToken) {
    throw new Error('Jira credentials are required for analyze mode');
  }
  if (!config.figmaAccessToken) {
    throw new Error('Figma access token is required for analyze mode');
  }

  const prHandler = new PRHandler(config.githubToken, owner, repo);
  const jiraClient = new JiraClient({
    baseUrl: config.jiraBaseUrl,
    email: config.jiraEmail,
    apiToken: config.jiraApiToken,
  });
  const figmaClient = new FigmaClient({
    accessToken: config.figmaAccessToken,
  });
  const bedrockClient = new BedrockClient({
    apiKey: config.bedrockApiKey,
    region: config.bedrockRegion || 'us-east-1',
    modelId: config.bedrockModelId,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  // Get PR info and find Figma links
  const prInfo = await prHandler.getPRInfo(pullNumber);
  const jiraUrls = JiraClient.findJiraUrls(prInfo.body);

  let figmaLinks: string[] = [];
  let jiraTicketKey = '';

  for (const jiraUrl of jiraUrls) {
    const issueKey = JiraClient.extractIssueKeyFromUrl(jiraUrl);
    if (!issueKey) continue;

    // Track the first Jira ticket key for commenting
    if (!jiraTicketKey) {
      jiraTicketKey = issueKey;
    }

    try {
      const ticketContent = await jiraClient.getTicketContent(issueKey);
      core.info(`=== JIRA TICKET CONTENT START (${issueKey}) ===`);
      core.info(ticketContent.fullText);
      core.info(`=== JIRA TICKET CONTENT END ===`);
      const extractionResult = await bedrockClient.extractFigmaLinks(ticketContent.fullText);
      
      for (const link of extractionResult.figmaLinks) {
        if (FigmaClient.isFigmaUrl(link)) {
          figmaLinks.push(link);
        }
      }
    } catch (error) {
      core.warning(`Error fetching Jira ticket: ${error}`);
    }
  }

  figmaLinks = [...new Set(figmaLinks)];

  if (figmaLinks.length === 0) {
    core.info('No Figma links found, skipping analysis');
    return;
  }

  // Get screenshots from the comment
  const comments = await prHandler.findScreenshotComments(pullNumber);
  
  // Find the triggering comment if specified
  let screenshotUrls: string[] = [];
  if (config.commentId) {
    const triggerComment = comments.find(c => c.id === config.commentId);
    if (triggerComment) {
      screenshotUrls = triggerComment.imageUrls;
    }
  } else {
    // Get all screenshots from all comments
    screenshotUrls = comments.flatMap(c => c.imageUrls);
  }

  if (screenshotUrls.length === 0) {
    core.info('No screenshots found in comment(s)');
    return;
  }

  core.info(`Found ${screenshotUrls.length} screenshot(s) to analyze`);
  core.info(`Found ${figmaLinks.length} Figma design(s) to compare against`);

  // Fetch Figma images
  const figmaImages: Array<{ url: string; imageBase64: string }> = [];
  
  for (const figmaUrl of figmaLinks) {
    try {
      const images = await figmaClient.getImagesFromUrl(figmaUrl);
      for (const img of images) {
        const imageBase64 = await downloadImageAsBase64(img.imageUrl);
        figmaImages.push({
          url: figmaUrl,
          imageBase64,
        });
      }
    } catch (error) {
      core.warning(`Error fetching Figma images from ${figmaUrl}: ${error}`);
    }
  }

  if (figmaImages.length === 0) {
    core.warning('Could not fetch any Figma images');
    return;
  }

  // Compare each screenshot against Figma designs
  const results: Array<{
    figmaUrl: string;
    screenshotUrl: string;
    overallMatch: 'pass' | 'fail' | 'warning';
    matchPercentage: number;
    summary: string;
    issues: UIComparisonResult['issues'];
    recommendations: string[];
  }> = [];

  for (const screenshotUrl of screenshotUrls) {
    const screenshotBase64 = await downloadImageAsBase64(screenshotUrl);

    // Compare against each Figma image (or just the first one for simplicity)
    for (const figmaImage of figmaImages) {
      core.info(`Comparing screenshot against Figma design...`);
      
      const comparisonResult = await bedrockClient.compareUIScreenshot(
        figmaImage.imageBase64,
        screenshotBase64,
        `Comparing implementation screenshot against Figma design from ${figmaImage.url}`
      );

      results.push({
        figmaUrl: figmaImage.url,
        screenshotUrl,
        ...comparisonResult,
      });
    }
  }

  // Post results to GitHub PR
  await prHandler.postComparisonResults(pullNumber, results);

  // Update commit status based on results
  const hasFailures = results.some(r => r.overallMatch === 'fail');
  const hasWarnings = results.some(r => r.overallMatch === 'warning');

  let statusState: 'success' | 'failure' | 'pending' = 'success';
  let statusDescription = 'All UI checks passed';

  if (hasFailures) {
    statusState = 'failure';
    statusDescription = 'UI discrepancies found - review required';
  } else if (hasWarnings) {
    statusState = 'success'; // Warnings don't block
    statusDescription = 'Minor UI issues found - review recommended';
  }

  await prHandler.setCommitStatus(
    prInfo.headSha,
    statusState,
    statusDescription,
    'UI QA Agent'
  );

  // Post results to Jira ticket as well
  if (jiraTicketKey) {
    core.info(`Attempting to post results to Jira ticket ${jiraTicketKey}...`);
    try {
      const prUrl = `https://github.com/${owner}/${repo}/pull/${pullNumber}`;
      const jiraComment = buildJiraComment(results, prUrl);
      core.info(`Jira comment length: ${jiraComment.length} characters`);
      await jiraClient.addComment(jiraTicketKey, jiraComment);
      core.info(`Successfully posted UI QA results to Jira ticket ${jiraTicketKey}`);
    } catch (error: any) {
      core.error(`Failed to post comment to Jira ticket ${jiraTicketKey}`);
      core.error(`Error: ${error.message || error}`);
      if (error.response?.data) {
        core.error(`Jira API response: ${JSON.stringify(error.response.data)}`);
      }
    }
  } else {
    core.info('No Jira ticket key found, skipping Jira comment');
  }

  core.setOutput('result', JSON.stringify(results));
  core.setOutput('status', statusState);
}

/**
 * Build a plain text comment for Jira from the comparison results
 */
function buildJiraComment(
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
  }>,
  prUrl: string
): string {
  const passCount = results.filter(r => r.overallMatch === 'pass').length;
  const failCount = results.filter(r => r.overallMatch === 'fail').length;
  const warningCount = results.filter(r => r.overallMatch === 'warning').length;

  let overallStatus = '✅ All Checks Passed';
  if (failCount > 0) {
    overallStatus = '❌ Issues Found';
  } else if (warningCount > 0) {
    overallStatus = '⚠️ Minor Issues';
  }

  let comment = `🔍 UI QA Analysis Results

Overall Status: ${overallStatus}

Summary:
• Pass: ${passCount}
• Warning: ${warningCount}
• Fail: ${failCount}

`;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const statusEmoji = result.overallMatch === 'pass' ? '✅' : result.overallMatch === 'warning' ? '⚠️' : '❌';

    comment += `--- Comparison ${i + 1} ---
Status: ${statusEmoji} ${result.matchPercentage}% match
Figma: ${result.figmaUrl}
Summary: ${result.summary}
`;

    if (result.issues.length > 0) {
      comment += `\nIssues:\n`;
      for (const issue of result.issues) {
        comment += `• [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description} (${issue.location})\n`;
      }
    }

    if (result.recommendations.length > 0) {
      comment += `\nRecommendations:\n`;
      for (const rec of result.recommendations) {
        comment += `• ${rec}\n`;
      }
    }

    comment += '\n';
  }

  comment += `---
View full details in PR: ${prUrl}
Analysis performed by UI QA Agent`;

  return comment;
}

async function run(): Promise<void> {
  try {
    const config = getConfig();
    
    core.info(`Running UI QA Agent in ${config.mode} mode`);

    switch (config.mode) {
      case 'detect':
        await runDetectMode(config);
        break;
      case 'request':
        await runRequestMode(config);
        break;
      case 'analyze':
        await runAnalyzeMode(config);
        break;
      default:
        throw new Error(`Unknown mode: ${config.mode}`);
    }

    core.info('UI QA Agent completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}
//
run();

