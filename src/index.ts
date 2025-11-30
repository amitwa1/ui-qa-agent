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
  // Bedrock configuration
  bedrockRegion?: string;
  bedrockModelId?: string;
  // AWS credentials for Bedrock authentication
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
    // Bedrock configuration
    bedrockRegion: core.getInput('bedrock-region') || 'us-east-1',
    bedrockModelId: core.getInput('bedrock-model-id') || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    // AWS credentials for Bedrock authentication
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

  // Debug: Log Jira base URL length to help diagnose without exposing secrets
  core.info(`Jira base URL length: ${config.jiraBaseUrl.length}, starts with https: ${config.jiraBaseUrl.startsWith('https://')}`);

  const jiraClient = new JiraClient({
    baseUrl: config.jiraBaseUrl,
    email: config.jiraEmail,
    apiToken: config.jiraApiToken,
  });

  const bedrockClient = new BedrockClient({
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
      throw new Error(`Could not extract issue key from: ${jiraUrl}`);
    }

    jiraTicketKey = issueKey;
    core.info(`Fetching Jira ticket: ${issueKey}`);

    try {
      const ticketContent = await jiraClient.getTicketContent(issueKey);
      core.info(`Ticket content length: ${ticketContent.fullText.length} chars`);

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
      throw new Error(`Error processing Jira ticket ${issueKey}: ${error}`);
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
    region: config.bedrockRegion || 'us-east-1',
    modelId: config.bedrockModelId,
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  // Get PR info and find Figma links
  const prInfo = await prHandler.getPRInfo(pullNumber);
  const jiraUrls = JiraClient.findJiraUrls(prInfo.body);

  let figmaLinks: string[] = [];

  for (const jiraUrl of jiraUrls) {
    const issueKey = JiraClient.extractIssueKeyFromUrl(jiraUrl);
    if (!issueKey) continue;

    try {
      const ticketContent = await jiraClient.getTicketContent(issueKey);
      const extractionResult = await bedrockClient.extractFigmaLinks(ticketContent.fullText);
      
      for (const link of extractionResult.figmaLinks) {
        if (FigmaClient.isFigmaUrl(link)) {
          figmaLinks.push(link);
        }
      }
    } catch (error) {
      throw new Error(`Error fetching Jira ticket: ${error}`);
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
      throw new Error(`Error fetching Figma images from ${figmaUrl}: ${error}`);
    }
  }

  if (figmaImages.length === 0) {
    throw new Error('Could not fetch any Figma images');
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

  // Post results
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

  core.setOutput('result', JSON.stringify(results));
  core.setOutput('status', statusState);
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

