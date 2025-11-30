import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface BedrockConfig {
  region: string;
  modelId?: string;
  // AWS credentials (required for SigV4 authentication)
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface FigmaLinkExtractionResult {
  figmaLinks: string[];
  confidence: 'high' | 'medium' | 'low';
  context: string;
}

export interface UIComparisonIssue {
  severity: 'critical' | 'major' | 'minor';
  category: 'missing_element' | 'wrong_style' | 'wrong_position' | 'wrong_content' | 'extra_element';
  description: string;
  location: string;
}

export interface UIComparisonResult {
  overallMatch: 'pass' | 'fail' | 'warning';
  matchPercentage: number;
  issues: UIComparisonIssue[];
  summary: string;
  recommendations: string[];
}

export class BedrockClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(config: BedrockConfig) {
    this.modelId = config.modelId || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

    // Debug logging (safe - doesn't expose secrets)
    console.log(`Bedrock config: region=${config.region}, model=${this.modelId}, hasCredentials=${!!(config.accessKeyId && config.secretAccessKey)}`);

    // Create Bedrock client with AWS credentials
    this.client = new BedrockRuntimeClient({
      region: config.region,
      ...(config.accessKeyId && config.secretAccessKey && {
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    });
  }

  /**
   * Extract Figma links from Jira ticket content using LLM
   */
  async extractFigmaLinks(ticketContent: string): Promise<FigmaLinkExtractionResult> {
    const prompt = `You are analyzing a Jira ticket to find Figma design links. 

Analyze the following Jira ticket content and extract ALL Figma links/URLs you can find.

Figma URLs typically look like:
- https://www.figma.com/file/...
- https://www.figma.com/design/...
- https://figma.com/file/...
- https://www.figma.com/proto/...

Also look for:
- Shortened URLs that might be Figma links (like bit.ly, tinyurl, etc.)
- References to Figma with nearby URLs
- Embedded links in text

TICKET CONTENT:
${ticketContent}

Respond in JSON format:
{
  "figmaLinks": ["url1", "url2"],
  "confidence": "high" | "medium" | "low",
  "context": "Brief explanation of where the links were found"
}

If no Figma links are found, return empty array for figmaLinks with "low" confidence.`;

    const response = await this.invokeModel(prompt);
    
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: try to extract URLs directly
      const figmaUrlPattern = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/[^\s"'<>]+/gi;
      const matches = ticketContent.match(figmaUrlPattern) || [];
      return {
        figmaLinks: matches,
        confidence: matches.length > 0 ? 'medium' : 'low',
        context: 'Extracted via regex fallback',
      };
    }

    return {
      figmaLinks: [],
      confidence: 'low',
      context: 'No Figma links found',
    };
  }

  /**
   * Compare a screenshot against a Figma design using vision
   */
  async compareUIScreenshot(
    figmaImageBase64: string,
    screenshotBase64: string,
    context?: string
  ): Promise<UIComparisonResult> {
    const prompt = `You are a UI/UX QA expert comparing an implementation screenshot against a Figma design.

${context ? `Context: ${context}` : ''}

TASK:
Compare the SCREENSHOT (second image) against the FIGMA DESIGN (first image) and identify any discrepancies.

Look for:
1. Missing UI elements (buttons, icons, text, images)
2. Wrong colors, fonts, or styling
3. Incorrect spacing, alignment, or positioning
4. Wrong text content or labels
5. Extra elements not in the design
6. Responsive/layout issues

For each issue found, categorize by severity:
- critical: Major functionality or branding issues
- major: Noticeable visual differences
- minor: Small deviations that may be acceptable

Respond in JSON format:
{
  "overallMatch": "pass" | "fail" | "warning",
  "matchPercentage": 0-100,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "missing_element" | "wrong_style" | "wrong_position" | "wrong_content" | "extra_element",
      "description": "Clear description of the issue",
      "location": "Where in the UI this issue appears"
    }
  ],
  "summary": "Brief overall assessment",
  "recommendations": ["List of suggested fixes"]
}

Guidelines:
- "pass": Match is 90%+ with no critical/major issues
- "warning": Match is 70-90% with only minor issues
- "fail": Match is below 70% or has critical/major issues`;

    const response = await this.invokeModelWithImages(
      prompt,
      [
        { data: figmaImageBase64, mediaType: 'image/png' },
        { data: screenshotBase64, mediaType: 'image/png' },
      ]
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      // Return a default error response
      return {
        overallMatch: 'warning',
        matchPercentage: 0,
        issues: [],
        summary: 'Failed to parse comparison results',
        recommendations: ['Please review manually'],
      };
    }

    return {
      overallMatch: 'warning',
      matchPercentage: 0,
      issues: [],
      summary: 'No comparison results generated',
      recommendations: ['Please review manually'],
    };
  }

  /**
   * Invoke the model with text-only prompt
   */
  private async invokeModel(prompt: string): Promise<string> {
    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      return responseBody.content[0].text;
    } catch (error: any) {
      const errorName = error.name || error.constructor?.name;
      const errorMessage = error.message || String(error);
      
      if (errorName === 'AccessDeniedException' || errorMessage.includes('403')) {
        throw new Error(
          `Bedrock API access denied. Check that:\n` +
          `1. AWS credentials have bedrock:InvokeModel permission\n` +
          `2. Model "${this.modelId}" is enabled in your AWS account\n` +
          `3. Region is correct\n` +
          `Details: ${errorMessage}`
        );
      }
      
      throw new Error(`Bedrock API error: ${errorMessage}`);
    }
  }

  /**
   * Invoke the model with images (vision)
   */
  private async invokeModelWithImages(
    prompt: string,
    images: Array<{ data: string; mediaType: string }>
  ): Promise<string> {
    const content: any[] = [];

    // Add images first
    for (const image of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.mediaType,
          data: image.data,
        },
      });
    }

    // Add text prompt
    content.push({
      type: 'text',
      text: prompt,
    });

    const body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    };

    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      return responseBody.content[0].text;
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      throw new Error(`Bedrock API error (vision): ${errorMessage}`);
    }
  }
}
