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
export declare class BedrockClient {
    private client;
    private modelId;
    private anthropicVersion;
    constructor(config: BedrockConfig);
    /**
     * Extract Figma links from Jira ticket content using LLM
     */
    extractFigmaLinks(ticketContent: string): Promise<FigmaLinkExtractionResult>;
    /**
     * Compare a screenshot against a Figma design using vision
     */
    compareUIScreenshot(figmaImageBase64: string, screenshotBase64: string, context?: string): Promise<UIComparisonResult>;
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