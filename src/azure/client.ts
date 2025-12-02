/**
 * Azure OpenAI client for LLM operations
 */

import axios from 'axios';

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion?: string;
}

export interface FigmaLinkExtractionResult {
  figmaLinks: string[];
  confidence: 'high' | 'medium' | 'low';
  context: string;
}

// Component analysis types matching ux_validator.py structure
export interface ComponentIssues {
  missing_component: boolean;
  missing_component_note: string;
  grammar_issues: string[];
  text_mismatch: string[];
  major_color_differences: string[];
  missing_fields: string[];
  field_notes: string;
  typography_issues: string[];
}

export interface ComponentAnalysis {
  name: string;
  type: string;
  description: string;
  found_in_input: boolean;
  issues: ComponentIssues;
  status: 'pass' | 'warning' | 'fail';
}

export interface ExtraComponent {
  name: string;
  type: string;
  description: string;
  severity: 'minor' | 'major';
}

export interface BackgroundColorIssue {
  has_difference: boolean;
  reference_color: string;
  input_color: string;
  note: string;
}

export interface GlobalIssues {
  background_color: BackgroundColorIssue;
  color_issues: string[];
  grammar_issues: string[];
  typography_issues: string[];
}

export interface OverlapIssue {
  element_name: string;
  overlaps_with: string;
  location: string;
  severity: 'minor' | 'major';
}

export interface ValidationSummary {
  total_reference_components: number;
  components_found: number;
  components_missing: number;
  extra_components_count: number;
  grammar_issues_count: number;
  color_issues_count: number;
  typography_issues_count: number;
  overlapping_elements_count: number;
  total_issues: number;
}

export interface UXValidationResult {
  reference_components: ComponentAnalysis[];
  extra_components_in_input: ExtraComponent[];
  global_issues: GlobalIssues;
  overlapping_elements: OverlapIssue[];
  summary: ValidationSummary;
  overall_status: 'pass' | 'warning' | 'fail';
  conclusion: string;
}

// Legacy interface for backwards compatibility
export interface UIComparisonResult {
  overallMatch: 'pass' | 'fail' | 'warning';
  matchPercentage: number;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    category: 'missing_element' | 'wrong_style' | 'wrong_position' | 'wrong_content' | 'extra_element';
    description: string;
    location: string;
  }>;
  summary: string;
  recommendations: string[];
  // Extended result from detailed validation
  detailedResult?: UXValidationResult;
}

// Interface for screenshot-to-design matching
export interface ScreenshotDesignMatch {
  screenshotIndex: number;
  figmaIndex: number;
  confidence: number; // 0-100
  reasoning: string;
}

export interface ScreenshotMatchResult {
  matches: ScreenshotDesignMatch[];
  unmatchedScreenshots: number[];
  unmatchedFigmaDesigns: number[];
}

export class AzureOpenAIClient {
  private apiKey: string;
  private endpoint: string;
  private deploymentName: string;
  private apiVersion: string;

  constructor(config: AzureOpenAIConfig) {
    if (!config.apiKey) {
      throw new Error('Azure OpenAI API key is required');
    }
    if (!config.endpoint) {
      throw new Error('Azure OpenAI endpoint is required');
    }
    if (!config.deploymentName) {
      throw new Error('Azure OpenAI deployment name is required');
    }

    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.deploymentName = config.deploymentName;
    this.apiVersion = config.apiVersion || '2024-12-01-preview';

    console.log(`Azure OpenAI client initialized: endpoint=${this.endpoint}, deployment=${this.deploymentName}`);
  }

  /**
   * Get the detailed UX validation prompt (ported from ux_validator.py)
   */
  private getUXValidationPrompt(): { system: string; user: string } {
    const systemPrompt = `You are a UX/UI design quality assurance expert. Your task is to perform a focused comparison between an input image (first image) and a reference Figma design (second image).

FOCUS ON THESE 6 CRITERIA ONLY:

1. COMPONENT COMPARISON (MISSING & EXTRA)
   - Identify ALL components in the reference Figma image
   - Verify each reference component exists in the input image - list MISSING components
   - Also identify any EXTRA components in the input image that are NOT in the reference (e.g., extra buttons, icons, UI elements)
   - Components include: buttons, icons, headers, text blocks, images, forms, panels, navigation elements, markers, legends, etc.

2. GRAMMAR AND TEXT CORRECTNESS
   - Check all text in the input image for grammar, spelling, and correctness
   - Compare text content with the Figma reference
   - If the Figma reference has incorrect text, mention it clearly
   - Flag any grammar or spelling errors in the input image

3. MAJOR COLOR DIFFERENCES
   - Detect MAJOR color differences including:
     * Background color differences
     * Component color differences (buttons, panels, etc.)
     * Text color differences
   - Ignore minor shade variations
   - Focus on significant mismatches (e.g., red vs black background, red vs green buttons)

4. FIELD IMPLEMENTATION CHECK
   - Verify that all fields within components are implemented in the input image
   - Account for dynamic content that may differ (e.g., WiFi network names, user-specific data, timestamps, MAC addresses)
   - Check that the structure and presence of fields match, even if values differ
   - Note if fields are missing or incorrectly implemented

5. TYPOGRAPHY (FONT, STYLE, SIZE)
   - Check font family, style (bold/italic/regular), and size
   - Only flag MAJOR differences (e.g., completely different font family, significantly different sizes)
   - Ignore minor variations (e.g., 1-2px size differences, slight weight variations)

6. OVERLAPPING BUTTONS/ELEMENTS
   - Check if any buttons overlap with other UI elements
   - Identify elements that are positioned incorrectly causing overlaps
   - Note any layout issues that cause elements to overlap

ANALYSIS STEPS:

STEP 1: List all components in the REFERENCE image (buttons, icons, text, panels, markers, etc.)
STEP 2: For each reference component, check if it exists in the input image
STEP 3: Scan the INPUT image for any EXTRA components not in the reference
STEP 4: Check background and overall color scheme differences
STEP 5: For each component, check grammar, colors, fields, and typography
STEP 6: Check for overlapping elements

Provide your response in the following JSON format:
{
  "reference_components": [
    {
      "name": "Component name from reference",
      "type": "button/header/text/image/icon/marker/panel/etc",
      "description": "Description of component location and purpose in reference",
      "found_in_input": true/false,
      "issues": {
        "missing_component": true/false,
        "missing_component_note": "Explanation if component is missing from input",
        "grammar_issues": ["List of grammar/spelling errors in this component's text"],
        "text_mismatch": ["List of text differences (note if Figma has errors)"],
        "major_color_differences": ["List of major color differences"],
        "missing_fields": ["List of fields that are missing"],
        "field_notes": "Notes about field implementation (accounting for dynamic content)",
        "typography_issues": ["List of major typography differences"]
      },
      "status": "pass/warning/fail"
    }
  ],
  "extra_components_in_input": [
    {
      "name": "Extra component name found in input but NOT in reference",
      "type": "button/header/text/image/icon/etc",
      "description": "Description of this extra component and its location",
      "severity": "minor/major"
    }
  ],
  "global_issues": {
    "background_color": {
      "has_difference": true/false,
      "reference_color": "Color description in reference",
      "input_color": "Color description in input",
      "note": "Description of the difference"
    },
    "color_issues": ["List of all color-related issues with descriptions"],
    "grammar_issues": ["List of all grammar/text issues with descriptions"],
    "typography_issues": ["List of all major typography issues with descriptions"]
  },
  "overlapping_elements": [
    {
      "element_name": "Name/description of overlapping element",
      "overlaps_with": "What it overlaps with",
      "location": "Where the overlap occurs",
      "severity": "minor/major"
    }
  ],
  "summary": {
    "total_reference_components": number,
    "components_found": number,
    "components_missing": number,
    "extra_components_count": number,
    "grammar_issues_count": number,
    "color_issues_count": number,
    "typography_issues_count": number,
    "overlapping_elements_count": number,
    "total_issues": number
  },
  "overall_status": "pass/warning/fail",
  "conclusion": "Overall assessment focusing on the 6 criteria"
}

Be THOROUGH. Identify ALL visible components. Don't miss buttons, icons, or UI elements.`;

    const userPrompt = `Compare the input image (first image) against the reference Figma design (second image).

IMPORTANT: 
1. List ALL components from the reference and check if each exists in the input
2. Find any EXTRA components in input that are NOT in the reference (e.g., extra buttons, icons)
3. Check background color and overall color scheme
4. Check for grammar/spelling issues in text
5. Check field implementation (ignore dynamic values like network names, IDs)
6. Check for major typography differences
7. Check for overlapping elements

Provide analysis in the requested JSON format.`;

    return { system: systemPrompt, user: userPrompt };
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
   * Compare a screenshot against a Figma design using vision with detailed UX validation
   */
  async compareUIScreenshot(
    figmaImageBase64: string,
    screenshotBase64: string,
    context?: string
  ): Promise<UIComparisonResult> {
    const { system, user } = this.getUXValidationPrompt();
    const fullPrompt = `${system}\n\n${context ? `Additional Context: ${context}\n\n` : ''}${user}`;

    const response = await this.invokeModelWithImages(
      fullPrompt,
      [
        { data: screenshotBase64, mediaType: 'image/png' },
        { data: figmaImageBase64, mediaType: 'image/png' },
      ]
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const detailedResult: UXValidationResult = JSON.parse(jsonMatch[0]);
        
        // Convert to legacy format for backwards compatibility
        return this.convertToLegacyFormat(detailedResult);
      }
    } catch (error) {
      console.error('Failed to parse UX validation response:', error);
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
   * Match screenshots to Figma designs using AI vision analysis
   * This method analyzes all images and determines which screenshot corresponds to which design
   */
  async matchScreenshotsToDesigns(
    screenshots: Array<{ url: string; base64: string }>,
    figmaDesigns: Array<{ url: string; base64: string }>
  ): Promise<ScreenshotMatchResult> {
    // If only one of each, just match them directly
    if (screenshots.length === 1 && figmaDesigns.length === 1) {
      return {
        matches: [{
          screenshotIndex: 0,
          figmaIndex: 0,
          confidence: 100,
          reasoning: 'Single screenshot matched to single design',
        }],
        unmatchedScreenshots: [],
        unmatchedFigmaDesigns: [],
      };
    }

    // Build prompt for AI to match images
    const prompt = this.buildMatchingPrompt(screenshots.length, figmaDesigns.length);
    
    // Prepare all images for the AI - first screenshots, then Figma designs
    const allImages: Array<{ data: string; mediaType: string }> = [];
    
    for (let i = 0; i < screenshots.length; i++) {
      allImages.push({ data: screenshots[i].base64, mediaType: 'image/png' });
    }
    
    for (let i = 0; i < figmaDesigns.length; i++) {
      allImages.push({ data: figmaDesigns[i].base64, mediaType: 'image/png' });
    }

    try {
      const response = await this.invokeModelWithImages(prompt, allImages);
      return this.parseMatchingResponse(response, screenshots.length, figmaDesigns.length);
    } catch (error) {
      console.error('Failed to match screenshots to designs:', error);
      // Fallback: match in order
      return this.createFallbackMatching(screenshots.length, figmaDesigns.length);
    }
  }

  /**
   * Build the prompt for matching screenshots to designs
   */
  private buildMatchingPrompt(screenshotCount: number, figmaCount: number): string {
    return `You are a UI/UX expert tasked with matching implementation screenshots to their corresponding Figma design references.

You are provided with ${screenshotCount} SCREENSHOT(S) (images 1-${screenshotCount}) followed by ${figmaCount} FIGMA DESIGN(S) (images ${screenshotCount + 1}-${screenshotCount + figmaCount}).

IMAGE ORDER:
- Images 1 to ${screenshotCount}: Implementation screenshots (labeled as Screenshot 0 to Screenshot ${screenshotCount - 1})
- Images ${screenshotCount + 1} to ${screenshotCount + figmaCount}: Figma designs (labeled as Figma 0 to Figma ${figmaCount - 1})

YOUR TASK:
Analyze the visual content, layout, components, and overall structure of each image to determine which screenshot corresponds to which Figma design.

Consider these factors when matching:
1. Overall page/screen layout and structure
2. Key UI components (buttons, forms, headers, navigation)
3. Color schemes and visual styling
4. Content areas and their arrangement
5. Specific UI elements that are unique to each design

IMPORTANT RULES:
- Each screenshot should match to at most ONE Figma design
- Each Figma design should match to at most ONE screenshot
- If a screenshot doesn't match any design well, mark it as unmatched
- If a Figma design has no matching screenshot, mark it as unmatched
- Provide confidence scores (0-100) for each match

Respond in this exact JSON format:
{
  "matches": [
    {
      "screenshotIndex": 0,
      "figmaIndex": 0,
      "confidence": 95,
      "reasoning": "Brief explanation of why these match"
    }
  ],
  "unmatchedScreenshots": [1],
  "unmatchedFigmaDesigns": [2]
}

Analyze the images carefully and provide your matching results.`;
  }

  /**
   * Parse the AI response for matching
   */
  private parseMatchingResponse(
    response: string,
    screenshotCount: number,
    figmaCount: number
  ): ScreenshotMatchResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate and sanitize the response
        const matches: ScreenshotDesignMatch[] = [];
        const usedScreenshots = new Set<number>();
        const usedFigmas = new Set<number>();
        
        for (const match of parsed.matches || []) {
          const sIdx = Number(match.screenshotIndex);
          const fIdx = Number(match.figmaIndex);
          
          // Validate indices and ensure no duplicates
          if (
            sIdx >= 0 && sIdx < screenshotCount &&
            fIdx >= 0 && fIdx < figmaCount &&
            !usedScreenshots.has(sIdx) &&
            !usedFigmas.has(fIdx)
          ) {
            matches.push({
              screenshotIndex: sIdx,
              figmaIndex: fIdx,
              confidence: Math.min(100, Math.max(0, Number(match.confidence) || 50)),
              reasoning: match.reasoning || 'Matched by AI analysis',
            });
            usedScreenshots.add(sIdx);
            usedFigmas.add(fIdx);
          }
        }
        
        // Find unmatched items
        const unmatchedScreenshots: number[] = [];
        const unmatchedFigmaDesigns: number[] = [];
        
        for (let i = 0; i < screenshotCount; i++) {
          if (!usedScreenshots.has(i)) {
            unmatchedScreenshots.push(i);
          }
        }
        
        for (let i = 0; i < figmaCount; i++) {
          if (!usedFigmas.has(i)) {
            unmatchedFigmaDesigns.push(i);
          }
        }
        
        return { matches, unmatchedScreenshots, unmatchedFigmaDesigns };
      }
    } catch (error) {
      console.error('Failed to parse matching response:', error);
    }
    
    return this.createFallbackMatching(screenshotCount, figmaCount);
  }

  /**
   * Create fallback matching (match in order)
   */
  private createFallbackMatching(screenshotCount: number, figmaCount: number): ScreenshotMatchResult {
    const matches: ScreenshotDesignMatch[] = [];
    const minCount = Math.min(screenshotCount, figmaCount);
    
    for (let i = 0; i < minCount; i++) {
      matches.push({
        screenshotIndex: i,
        figmaIndex: i,
        confidence: 50,
        reasoning: 'Fallback: matched by upload order',
      });
    }
    
    const unmatchedScreenshots: number[] = [];
    const unmatchedFigmaDesigns: number[] = [];
    
    for (let i = minCount; i < screenshotCount; i++) {
      unmatchedScreenshots.push(i);
    }
    
    for (let i = minCount; i < figmaCount; i++) {
      unmatchedFigmaDesigns.push(i);
    }
    
    return { matches, unmatchedScreenshots, unmatchedFigmaDesigns };
  }

  /**
   * Convert detailed UX validation result to legacy format for backwards compatibility
   */
  private convertToLegacyFormat(detailedResult: UXValidationResult): UIComparisonResult {
    const issues: UIComparisonResult['issues'] = [];

    // Convert missing components
    for (const comp of detailedResult.reference_components) {
      if (!comp.found_in_input || comp.issues.missing_component) {
        issues.push({
          severity: 'critical',
          category: 'missing_element',
          description: `Missing component: ${comp.name} - ${comp.issues.missing_component_note || comp.description}`,
          location: comp.description,
        });
      }

      // Add grammar issues
      for (const grammarIssue of comp.issues.grammar_issues || []) {
        issues.push({
          severity: 'major',
          category: 'wrong_content',
          description: grammarIssue,
          location: comp.name,
        });
      }

      // Add color issues
      for (const colorIssue of comp.issues.major_color_differences || []) {
        issues.push({
          severity: 'major',
          category: 'wrong_style',
          description: colorIssue,
          location: comp.name,
        });
      }

      // Add typography issues
      for (const typoIssue of comp.issues.typography_issues || []) {
        issues.push({
          severity: 'minor',
          category: 'wrong_style',
          description: typoIssue,
          location: comp.name,
        });
      }

      // Add missing fields
      for (const field of comp.issues.missing_fields || []) {
        issues.push({
          severity: 'major',
          category: 'missing_element',
          description: `Missing field: ${field}`,
          location: comp.name,
        });
      }
    }

    // Convert extra components
    for (const extra of detailedResult.extra_components_in_input || []) {
      issues.push({
        severity: extra.severity === 'major' ? 'major' : 'minor',
        category: 'extra_element',
        description: `Extra component not in design: ${extra.name} - ${extra.description}`,
        location: extra.description,
      });
    }

    // Add overlapping elements
    for (const overlap of detailedResult.overlapping_elements || []) {
      issues.push({
        severity: overlap.severity === 'major' ? 'major' : 'minor',
        category: 'wrong_position',
        description: `${overlap.element_name} overlaps with ${overlap.overlaps_with}`,
        location: overlap.location,
      });
    }

    // Calculate match percentage
    const summary = detailedResult.summary;
    const totalComponents = summary.total_reference_components || 1;
    const matchPercentage = Math.round(((summary.components_found || 0) / totalComponents) * 100);

    // Generate recommendations
    const recommendations: string[] = [];
    if (summary.components_missing > 0) {
      recommendations.push(`Add ${summary.components_missing} missing component(s) from the design`);
    }
    if (summary.extra_components_count > 0) {
      recommendations.push(`Review ${summary.extra_components_count} extra component(s) not in the design`);
    }
    if (summary.grammar_issues_count > 0) {
      recommendations.push(`Fix ${summary.grammar_issues_count} grammar/text issue(s)`);
    }
    if (summary.color_issues_count > 0) {
      recommendations.push(`Fix ${summary.color_issues_count} color difference(s)`);
    }
    if (summary.typography_issues_count > 0) {
      recommendations.push(`Review ${summary.typography_issues_count} typography issue(s)`);
    }
    if (summary.overlapping_elements_count > 0) {
      recommendations.push(`Fix ${summary.overlapping_elements_count} overlapping element(s)`);
    }

    return {
      overallMatch: detailedResult.overall_status,
      matchPercentage,
      issues,
      summary: detailedResult.conclusion,
      recommendations,
      detailedResult,
    };
  }

  /**
   * Invoke the model with text-only prompt
   */
  private async invokeModel(prompt: string): Promise<string> {
    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    try {
      const response = await axios.post(
        url,
        {
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 4000,
          temperature: 0.2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
        }
      );

      return response.data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      console.error('Azure OpenAI API error:', error.response?.data || error.message);
      throw new Error(`Azure OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Invoke the model with images (vision)
   */
  private async invokeModelWithImages(
    prompt: string,
    images: Array<{ data: string; mediaType: string }>
  ): Promise<string> {
    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const content: any[] = [];

    // Add images first
    for (const image of images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mediaType};base64,${image.data}`,
        },
      });
    }

    // Add text prompt
    content.push({
      type: 'text',
      text: prompt,
    });

    try {
      const response = await axios.post(
        url,
        {
          messages: [
            {
              role: 'user',
              content,
            },
          ],
          max_tokens: 4000,
          temperature: 0.2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
        }
      );

      return response.data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      console.error('Azure OpenAI API error (vision):', error.response?.data || error.message);
      throw new Error(`Azure OpenAI API error (vision): ${error.response?.data?.error?.message || error.message}`);
    }
  }
}
