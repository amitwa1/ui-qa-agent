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
export declare class PRHandler {
    private octokit;
    private owner;
    private repo;
    constructor(token: string, owner: string, repo: string);
    /**
     * Get PR information
     */
    getPRInfo(pullNumber: number): Promise<PRInfo>;
    /**
     * Extract image URLs from markdown text
     * Looks for patterns like:
     * - ![alt](url)
     * - <img src="url">
     * - Direct GitHub user-content URLs
     */
    static extractImagesFromMarkdown(text: string): ExtractedImage[];
    /**
     * Get all comments on a PR
     */
    getPRComments(pullNumber: number): Promise<PRComment[]>;
    /**
     * Find comments with screenshots (images)
     */
    findScreenshotComments(pullNumber: number): Promise<PRComment[]>;
    /**
     * Post a comment on the PR
     */
    postComment(pullNumber: number, body: string): Promise<number>;
    /**
     * Update an existing comment
     */
    updateComment(commentId: number, body: string): Promise<void>;
    /**
     * Find an existing comment by a marker string
     */
    findCommentByMarker(pullNumber: number, marker: string): Promise<PRComment | null>;
    /**
     * Post or update a comment (update if exists with marker, otherwise create)
     */
    postOrUpdateComment(pullNumber: number, body: string, marker: string): Promise<number>;
    /**
     * Post a request for screenshots
     */
    requestScreenshots(pullNumber: number, figmaLinks: string[]): Promise<number>;
    /**
     * Post comparison results
     */
    postComparisonResults(pullNumber: number, results: Array<{
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
    }>): Promise<number>;
    /**
     * Download an image from a URL and return as base64
     */
    downloadImageAsBase64(imageUrl: string): Promise<string>;
    /**
     * Set commit status
     */
    setCommitStatus(sha: string, state: 'pending' | 'success' | 'failure' | 'error', description: string, context?: string): Promise<void>;
}
//# sourceMappingURL=pr-handler.d.ts.map