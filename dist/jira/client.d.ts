export interface JiraConfig {
    baseUrl: string;
    email: string;
    apiToken: string;
}
export interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        description: any;
        comment?: {
            comments: Array<{
                body: any;
                author: {
                    displayName: string;
                };
                created: string;
            }>;
        };
    };
}
export interface JiraTicketContent {
    key: string;
    summary: string;
    descriptionText: string;
    commentsText: string[];
    fullText: string;
}
export declare class JiraClient {
    private client;
    private baseUrl;
    constructor(config: JiraConfig);
    /**
     * Extract issue key from a Jira URL
     * Supports formats like:
     * - https://company.atlassian.net/browse/PROJ-123
     * - https://company.atlassian.net/browse/PROJ-123?atlOrigin=...
     * - https://company.atlassian.net/jira/software/projects/PROJ/boards/1?selectedIssue=PROJ-123
     */
    static extractIssueKeyFromUrl(url: string): string | null;
    /**
     * Find Jira URLs in text (PR description)
     * Handles various formats including markdown links
     */
    static findJiraUrls(text: string): string[];
    /**
     * Convert Atlassian Document Format (ADF) to plain text
     * Extracts both text content AND URLs from links
     */
    private adfToText;
    /**
     * Fetch a Jira issue by key
     */
    getIssue(issueKey: string): Promise<JiraIssue>;
    /**
     * Get all text content from a Jira ticket (description + comments)
     * This is used for LLM processing to find Figma links
     */
    getTicketContent(issueKey: string): Promise<JiraTicketContent>;
    /**
     * Add a comment to a Jira issue
     * The comment body should be in Atlassian Document Format (ADF)
     */
    addComment(issueKey: string, commentBody: string): Promise<void>;
    /**
     * Build the Jira issue URL
     */
    getIssueUrl(issueKey: string): string;
}
//# sourceMappingURL=client.d.ts.map