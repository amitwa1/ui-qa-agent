import axios, { AxiosInstance } from 'axios';

export interface BedrockConfig {
  // API Key authentication (recommended)
  apiKey?: string;
  region: string;
  profileId?: string;  // Model ID like 'global.anthropic.claude-sonnet-4-20250514-v1:0'
  anthropicVersion?: string;
  
  // Legacy AWS credentials authentication
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
  private httpClient: AxiosInstance;
  private config: BedrockConfig;
  private modelId: string;
  private anthropicVersion: string;

  constructor(config: BedrockConfig) {
    this.config = config;
    this.modelId = config.profileId || 'anthropic.claude-3-5-sonnet-20240620-v1:0';
    this.anthropicVersion = config.anthropicVersion || 'bedrock-2023-05-31';

    // Create HTTP client for API Key authentication
    const baseURL = `https://bedrock-runtime.${config.region}.amazonaws.com`;
    
    this.httpClient = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(config.apiKey && { 'x-api-key': config.apiKey }),
      },
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
      anthropic_version: this.anthropicVersion,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const response = await this.httpClient.post(
      `/model/${encodeURIComponent(this.modelId)}/invoke`,
      body
    );

    return response.data.content[0].text;
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
      anthropic_version: this.anthropicVersion,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    };

    const response = await this.httpClient.post(
      `/model/${encodeURIComponent(this.modelId)}/invoke`,
      body
    );

    return response.data.content[0].text;
  }
}
