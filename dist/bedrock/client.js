"use strict";
/**
 * AWS Bedrock client for LLM operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockClient = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
class BedrockClient {
    constructor(config) {
        this.modelId = config.modelId || 'us.anthropic.claude-sonnet-4-20250514-v1:0';
        this.anthropicVersion = config.anthropicVersion || 'bedrock-2023-05-31';
        // Validate region
        if (!config.region) {
            throw new Error('AWS Bedrock region is required');
        }
        // Initialize client config
        const clientConfig = { region: config.region };
        // Priority: API Key > Access Keys > Default credential chain
        if (config.apiKey) {
            console.log('Using AWS Bedrock API Key for authentication (July 2025 feature)');
            // Set the API key as AWS_BEARER_TOKEN_BEDROCK environment variable
            // This is the correct way to use Bedrock API keys according to AWS documentation
            process.env.AWS_BEARER_TOKEN_BEDROCK = config.apiKey;
            console.log('Set AWS_BEARER_TOKEN_BEDROCK environment variable for Bedrock authentication');
            // Don't set any credentials - let AWS SDK use the bearer token
        }
        else if (config.accessKeyId && config.secretAccessKey) {
            console.log('Using explicit AWS Access Key credentials for Bedrock');
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            };
        }
        else {
            console.log('Using default AWS credential chain for Bedrock');
        }
        // Debug logging (safe - doesn't expose secrets)
        console.log(`Bedrock config: region=${config.region}, model=${this.modelId}, hasApiKey=${!!config.apiKey}, hasCredentials=${!!(config.accessKeyId && config.secretAccessKey)}`);
        try {
            this.client = new client_bedrock_runtime_1.BedrockRuntimeClient(clientConfig);
            console.log(`Bedrock client initialized for region: ${config.region}, model: ${this.modelId}`);
        }
        catch (error) {
            console.error('Failed to initialize Bedrock client:', error);
            throw new Error(`Failed to initialize Bedrock client: ${error}`);
        }
    }
    /**
     * Get the detailed UX validation prompt (ported from ux_validator.py)
     */
    getUXValidationPrompt() {
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

IMPORTANT - BOUNDING BOX COORDINATES:
For each issue found, you MUST provide a bounding_box with the approximate location in the INPUT (screenshot) image.
Coordinates are PERCENTAGES (0-100) of the image dimensions:
- x: left edge percentage (0 = left edge, 100 = right edge)
- y: top edge percentage (0 = top edge, 100 = bottom edge)  
- width: width as percentage of image width
- height: height as percentage of image height

Example: A button in the top-right corner might have: {"x": 75, "y": 5, "width": 20, "height": 8}

Provide your response in the following JSON format:
{
  "reference_components": [
    {
      "name": "Component name from reference",
      "type": "button/header/text/image/icon/marker/panel/etc",
      "description": "Description of component location and purpose in reference",
      "found_in_input": true/false,
      "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0},
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
      "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0},
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
    "color_issues": [{"description": "Issue description", "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0}}],
    "grammar_issues": [{"description": "Issue description", "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0}}],
    "typography_issues": [{"description": "Issue description", "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0}}]
  },
  "overlapping_elements": [
    {
      "element_name": "Name/description of overlapping element",
      "overlaps_with": "What it overlaps with",
      "location": "Where the overlap occurs",
      "bounding_box": {"x": 0, "y": 0, "width": 0, "height": 0},
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
    async extractFigmaLinks(ticketContent) {
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
        }
        catch {
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
    async compareUIScreenshot(figmaImageBase64, screenshotBase64, context) {
        const { system, user } = this.getUXValidationPrompt();
        const fullPrompt = `${system}\n\n${context ? `Additional Context: ${context}\n\n` : ''}${user}`;
        const response = await this.invokeModelWithImages(fullPrompt, [
            { data: screenshotBase64, mediaType: 'image/png' },
            { data: figmaImageBase64, mediaType: 'image/png' },
        ]);
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const detailedResult = JSON.parse(jsonMatch[0]);
                // Convert to legacy format for backwards compatibility
                return this.convertToLegacyFormat(detailedResult);
            }
        }
        catch (error) {
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
    async matchScreenshotsToDesigns(screenshots, figmaDesigns) {
        console.log(`[Matching] Starting match: ${screenshots.length} screenshot(s) vs ${figmaDesigns.length} Figma design(s)`);
        // If only one of each, just match them directly
        if (screenshots.length === 1 && figmaDesigns.length === 1) {
            console.log('[Matching] Single screenshot + single design: direct match');
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
        // If only one screenshot but multiple designs, match screenshot to first design
        // (user likely wants to compare their screenshot against the first design variant)
        if (screenshots.length === 1 && figmaDesigns.length > 1) {
            console.log('[Matching] Single screenshot with multiple designs: matching to first design (index 0)');
            return {
                matches: [{
                        screenshotIndex: 0,
                        figmaIndex: 0,
                        confidence: 80,
                        reasoning: 'Single screenshot matched to first Figma design. Upload additional screenshots to match other designs.',
                    }],
                unmatchedScreenshots: [],
                unmatchedFigmaDesigns: Array.from({ length: figmaDesigns.length - 1 }, (_, i) => i + 1),
            };
        }
        // Build prompt for AI to match images
        const prompt = this.buildMatchingPrompt(screenshots.length, figmaDesigns.length);
        // Prepare all images for the AI - first screenshots, then Figma designs
        const allImages = [];
        for (let i = 0; i < screenshots.length; i++) {
            allImages.push({ data: screenshots[i].base64, mediaType: 'image/png' });
        }
        for (let i = 0; i < figmaDesigns.length; i++) {
            allImages.push({ data: figmaDesigns[i].base64, mediaType: 'image/png' });
        }
        try {
            console.log(`[Matching] Calling AI with ${allImages.length} images...`);
            const response = await this.invokeModelWithImages(prompt, allImages);
            console.log(`[Matching] AI response received, parsing...`);
            const result = this.parseMatchingResponse(response, screenshots.length, figmaDesigns.length);
            console.log(`[Matching] Parsed result: ${result.matches.length} matches, ${result.unmatchedScreenshots.length} unmatched screenshots, ${result.unmatchedFigmaDesigns.length} unmatched designs`);
            return result;
        }
        catch (error) {
            console.error('[Matching] Failed to match screenshots to designs:', error);
            // Fallback: match in order
            console.log('[Matching] Using fallback order-based matching');
            return this.createFallbackMatching(screenshots.length, figmaDesigns.length);
        }
    }
    /**
     * Build the prompt for matching screenshots to designs
     */
    buildMatchingPrompt(screenshotCount, figmaCount) {
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
    parseMatchingResponse(response, screenshotCount, figmaCount) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log(`[Matching] Found JSON in response`);
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`[Matching] Parsed JSON: matches=${(parsed.matches || []).length}`);
                // If AI returned empty matches but we have both screenshots and designs, use fallback
                if ((!parsed.matches || parsed.matches.length === 0) && screenshotCount > 0 && figmaCount > 0) {
                    console.log(`[Matching] AI returned empty matches - using fallback`);
                    return this.createFallbackMatching(screenshotCount, figmaCount);
                }
                // Validate and sanitize the response
                const matches = [];
                const usedScreenshots = new Set();
                const usedFigmas = new Set();
                for (const match of parsed.matches || []) {
                    const sIdx = Number(match.screenshotIndex);
                    const fIdx = Number(match.figmaIndex);
                    console.log(`[Matching] Processing match: screenshot=${sIdx}, figma=${fIdx}`);
                    // Validate indices and ensure no duplicates
                    if (sIdx >= 0 && sIdx < screenshotCount &&
                        fIdx >= 0 && fIdx < figmaCount &&
                        !usedScreenshots.has(sIdx) &&
                        !usedFigmas.has(fIdx)) {
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
                // If no valid matches were parsed but we have both screenshots and designs, use fallback
                if (matches.length === 0 && screenshotCount > 0 && figmaCount > 0) {
                    console.log(`[Matching] No valid matches parsed from AI response - using fallback`);
                    return this.createFallbackMatching(screenshotCount, figmaCount);
                }
                // Find unmatched items
                const unmatchedScreenshots = [];
                const unmatchedFigmaDesigns = [];
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
                console.log(`[Matching] Final result: ${matches.length} matches, ${unmatchedScreenshots.length} unmatched screenshots, ${unmatchedFigmaDesigns.length} unmatched Figma designs`);
                return { matches, unmatchedScreenshots, unmatchedFigmaDesigns };
            }
            else {
                console.log(`[Matching] No JSON found in AI response`);
            }
        }
        catch (error) {
            console.error('[Matching] Failed to parse matching response:', error);
        }
        console.log(`[Matching] Using fallback matching`);
        return this.createFallbackMatching(screenshotCount, figmaCount);
    }
    /**
     * Create fallback matching (match in order)
     */
    createFallbackMatching(screenshotCount, figmaCount) {
        const matches = [];
        const minCount = Math.min(screenshotCount, figmaCount);
        for (let i = 0; i < minCount; i++) {
            matches.push({
                screenshotIndex: i,
                figmaIndex: i,
                confidence: 50,
                reasoning: 'Fallback: matched by upload order',
            });
        }
        const unmatchedScreenshots = [];
        const unmatchedFigmaDesigns = [];
        for (let i = minCount; i < screenshotCount; i++) {
            unmatchedScreenshots.push(i);
        }
        for (let i = minCount; i < figmaCount; i++) {
            unmatchedFigmaDesigns.push(i);
        }
        return { matches, unmatchedScreenshots, unmatchedFigmaDesigns };
    }
    /**
     * Helper to extract bounding box from various issue formats
     */
    extractBoundingBox(item) {
        if (typeof item === 'object' && item !== null && 'bounding_box' in item) {
            const bb = item.bounding_box;
            if (bb && typeof bb.x === 'number' && typeof bb.y === 'number') {
                return bb;
            }
        }
        return undefined;
    }
    /**
     * Helper to get description from string or object with description
     */
    getDescription(item) {
        if (typeof item === 'string')
            return item;
        return item.description;
    }
    /**
     * Convert detailed UX validation result to legacy format for backwards compatibility
     */
    convertToLegacyFormat(detailedResult) {
        const issues = [];
        // Convert missing components
        for (const comp of detailedResult.reference_components) {
            if (!comp.found_in_input || comp.issues.missing_component) {
                issues.push({
                    severity: 'critical',
                    category: 'missing_element',
                    description: `Missing component: ${comp.name} - ${comp.issues.missing_component_note || comp.description}`,
                    location: comp.description,
                    boundingBox: comp.bounding_box,
                });
            }
            // Add grammar issues
            for (const grammarIssue of comp.issues.grammar_issues || []) {
                issues.push({
                    severity: 'major',
                    category: 'wrong_content',
                    description: this.getDescription(grammarIssue),
                    location: comp.name,
                    boundingBox: comp.bounding_box || this.extractBoundingBox(grammarIssue),
                });
            }
            // Add color issues
            for (const colorIssue of comp.issues.major_color_differences || []) {
                issues.push({
                    severity: 'major',
                    category: 'wrong_style',
                    description: this.getDescription(colorIssue),
                    location: comp.name,
                    boundingBox: comp.bounding_box || this.extractBoundingBox(colorIssue),
                });
            }
            // Add typography issues
            for (const typoIssue of comp.issues.typography_issues || []) {
                issues.push({
                    severity: 'minor',
                    category: 'wrong_style',
                    description: this.getDescription(typoIssue),
                    location: comp.name,
                    boundingBox: comp.bounding_box || this.extractBoundingBox(typoIssue),
                });
            }
            // Add missing fields
            for (const field of comp.issues.missing_fields || []) {
                issues.push({
                    severity: 'major',
                    category: 'missing_element',
                    description: `Missing field: ${field}`,
                    location: comp.name,
                    boundingBox: comp.bounding_box,
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
                boundingBox: extra.bounding_box,
            });
        }
        // Add global issues with bounding boxes
        if (detailedResult.global_issues) {
            for (const colorIssue of detailedResult.global_issues.color_issues || []) {
                issues.push({
                    severity: 'major',
                    category: 'wrong_style',
                    description: `Color issue: ${this.getDescription(colorIssue)}`,
                    location: 'Global',
                    boundingBox: this.extractBoundingBox(colorIssue),
                });
            }
            for (const grammarIssue of detailedResult.global_issues.grammar_issues || []) {
                issues.push({
                    severity: 'major',
                    category: 'wrong_content',
                    description: `Grammar issue: ${this.getDescription(grammarIssue)}`,
                    location: 'Global',
                    boundingBox: this.extractBoundingBox(grammarIssue),
                });
            }
            for (const typoIssue of detailedResult.global_issues.typography_issues || []) {
                issues.push({
                    severity: 'minor',
                    category: 'wrong_style',
                    description: `Typography issue: ${this.getDescription(typoIssue)}`,
                    location: 'Global',
                    boundingBox: this.extractBoundingBox(typoIssue),
                });
            }
        }
        // Add overlapping elements
        for (const overlap of detailedResult.overlapping_elements || []) {
            issues.push({
                severity: overlap.severity === 'major' ? 'major' : 'minor',
                category: 'wrong_position',
                description: `${overlap.element_name} overlaps with ${overlap.overlaps_with}`,
                location: overlap.location,
                boundingBox: overlap.bounding_box,
            });
        }
        // Calculate match percentage
        const summary = detailedResult.summary;
        const totalComponents = summary.total_reference_components || 1;
        const matchPercentage = Math.round(((summary.components_found || 0) / totalComponents) * 100);
        // Generate recommendations
        const recommendations = [];
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
    async invokeModel(prompt) {
        try {
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
            const command = new client_bedrock_runtime_1.InvokeModelCommand({
                modelId: this.modelId,
                body: JSON.stringify(body),
                contentType: 'application/json',
            });
            const response = await this.client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.content?.[0]?.text || '';
        }
        catch (error) {
            console.error('Bedrock API error:', error);
            // Provide specific error messages for common issues
            if (error?.name === 'UnrecognizedClientException') {
                throw new Error(`AWS Bedrock authentication failed: ${error.message}. ` +
                    `Check your BEDROCK_API_KEY or AWS credentials.`);
            }
            if (error?.name === 'AccessDeniedException') {
                throw new Error(`AWS Bedrock access denied: ${error.message}. ` +
                    `Check IAM permissions for bedrock:InvokeModel and model access for ${this.modelId}`);
            }
            if (error?.name === 'ValidationException') {
                throw new Error(`AWS Bedrock validation error: ${error.message}. ` +
                    `Check model ID and request parameters for ${this.modelId}`);
            }
            throw new Error(`Bedrock API error: ${error?.message || error}`);
        }
    }
    /**
     * Invoke the model with images (vision)
     */
    async invokeModelWithImages(prompt, images) {
        const content = [];
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
        try {
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
            const command = new client_bedrock_runtime_1.InvokeModelCommand({
                modelId: this.modelId,
                body: JSON.stringify(body),
                contentType: 'application/json',
            });
            const response = await this.client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.content?.[0]?.text || '';
        }
        catch (error) {
            console.error('Bedrock API error (vision):', error);
            throw new Error(`Bedrock API error (vision): ${error?.message || error}`);
        }
    }
}
exports.BedrockClient = BedrockClient;
//# sourceMappingURL=client.js.map