/**
 * Azure OpenAI client for LLM operations
 */
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
export declare class AzureOpenAIClient {
    private apiKey;
    private endpoint;
    private deploymentName;
    private apiVersion;
    constructor(config: AzureOpenAIConfig);
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