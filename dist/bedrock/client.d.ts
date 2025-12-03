/**
 * AWS Bedrock client for LLM operations
 */
export interface BedrockConfig {
    apiKey?: string;
    region: string;
    modelId?: string;
    anthropicVersion?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}
export interface FigmaLinkExtractionResult {
    figmaLinks: string[];
    confidence: 'high' | 'medium' | 'low';
    context: string;
}
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface IssueWithLocation {
    description: string;
    bounding_box?: BoundingBox;
}
export interface ComponentIssues {
    missing_component: boolean;
    missing_component_note: string;
    grammar_issues: (string | IssueWithLocation)[];
    text_mismatch: (string | IssueWithLocation)[];
    major_color_differences: (string | IssueWithLocation)[];
    missing_fields: string[];
    field_notes: string;
    typography_issues: (string | IssueWithLocation)[];
}
export interface ComponentAnalysis {
    name: string;
    type: string;
    description: string;
    found_in_input: boolean;
    bounding_box?: BoundingBox;
    issues: ComponentIssues;
    status: 'pass' | 'warning' | 'fail';
}
export interface ExtraComponent {
    name: string;
    type: string;
    description: string;
    bounding_box?: BoundingBox;
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
    color_issues: (string | IssueWithLocation)[];
    grammar_issues: (string | IssueWithLocation)[];
    typography_issues: (string | IssueWithLocation)[];
}
export interface OverlapIssue {
    element_name: string;
    overlaps_with: string;
    location: string;
    bounding_box?: BoundingBox;
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
export interface UIComparisonIssue {
    severity: 'critical' | 'major' | 'minor';
    category: 'missing_element' | 'wrong_style' | 'wrong_position' | 'wrong_content' | 'extra_element';
    description: string;
    location: string;
    boundingBox?: BoundingBox;
}
export interface UIComparisonResult {
    overallMatch: 'pass' | 'fail' | 'warning';
    matchPercentage: number;
    issues: UIComparisonIssue[];
    summary: string;
    recommendations: string[];
    detailedResult?: UXValidationResult;
}
export interface ScreenshotDesignMatch {
    screenshotIndex: number;
    figmaIndex: number;
    confidence: number;
    reasoning: string;
}
export interface ScreenshotMatchResult {
    matches: ScreenshotDesignMatch[];
    unmatchedScreenshots: number[];
    unmatchedFigmaDesigns: number[];
}
export declare class BedrockClient {
    private client;
    private modelId;
    private anthropicVersion;
    constructor(config: BedrockConfig);
    /**
     * Get the detailed UX validation prompt (ported from ux_validator.py)
     */
    private getUXValidationPrompt;
    /**
     * Extract Figma links from Jira ticket content using LLM
     */
    extractFigmaLinks(ticketContent: string): Promise<FigmaLinkExtractionResult>;
    /**
     * Compare a screenshot against a Figma design using vision with detailed UX validation
     */
    compareUIScreenshot(figmaImageBase64: string, screenshotBase64: string, context?: string): Promise<UIComparisonResult>;
    /**
     * Match screenshots to Figma designs using AI vision analysis
     * This method analyzes all images and determines which screenshot corresponds to which design
     */
    matchScreenshotsToDesigns(screenshots: Array<{
        url: string;
        base64: string;
    }>, figmaDesigns: Array<{
        url: string;
        base64: string;
    }>): Promise<ScreenshotMatchResult>;
    /**
     * Build the prompt for matching screenshots to designs
     */
    private buildMatchingPrompt;
    /**
     * Parse the AI response for matching
     */
    private parseMatchingResponse;
    /**
     * Create fallback matching (match in order)
     */
    private createFallbackMatching;
    /**
     * Helper to extract bounding box from various issue formats
     */
    private extractBoundingBox;
    /**
     * Helper to get description from string or object with description
     */
    private getDescription;
    /**
     * Convert detailed UX validation result to legacy format for backwards compatibility
     */
    private convertToLegacyFormat;
    /**
     * Invoke the model with text-only prompt
     */
    private invokeModel;
    /**
     * Invoke the model with images (vision)
     */
    private invokeModelWithImages;
}
//# sourceMappingURL=client.d.ts.map