"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JiraClient = void 0;
const axios_1 = __importDefault(require("axios"));
class JiraClient {
    constructor(config) {
        // Validate the base URL before using it
        let baseUrl = config.baseUrl?.trim() || '';
        // Auto-add https:// if missing
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            baseUrl = `https://${baseUrl}`;
        }
        // Remove trailing slash
        baseUrl = baseUrl.replace(/\/+$/, '');
        // Validate URL format
        try {
            new URL(baseUrl);
        }
        catch (e) {
            throw new Error(`Invalid Jira base URL: "${config.baseUrl}". Expected format: https://your-domain.atlassian.net`);
        }
        this.baseUrl = baseUrl;
        const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
        this.client = axios_1.default.create({
            baseURL: `${baseUrl}/rest/api/3`,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Extract issue key from a Jira URL
     * Supports formats like:
     * - https://company.atlassian.net/browse/PROJ-123
     * - https://company.atlassian.net/browse/PROJ-123?atlOrigin=...
     * - https://company.atlassian.net/jira/software/projects/PROJ/boards/1?selectedIssue=PROJ-123
     */
    static extractIssueKeyFromUrl(url) {
        // Clean the URL - remove trailing punctuation and whitespace
        const cleanUrl = url.trim().replace(/[)\]}>.,;:!?]+$/, '');
        // Pattern for /browse/PROJ-123 (with optional query params)
        const browsePattern = /\/browse\/([A-Z]+-\d+)/i;
        const browseMatch = cleanUrl.match(browsePattern);
        if (browseMatch) {
            return browseMatch[1].toUpperCase();
        }
        // Pattern for selectedIssue=PROJ-123
        const selectedIssuePattern = /selectedIssue=([A-Z]+-\d+)/i;
        const selectedMatch = cleanUrl.match(selectedIssuePattern);
        if (selectedMatch) {
            return selectedMatch[1].toUpperCase();
        }
        // Pattern for /issues/PROJ-123
        const issuesPattern = /\/issues\/([A-Z]+-\d+)/i;
        const issuesMatch = cleanUrl.match(issuesPattern);
        if (issuesMatch) {
            return issuesMatch[1].toUpperCase();
        }
        // Try to find any issue key pattern in the URL (fallback)
        const anyKeyPattern = /([A-Z]{2,}-\d+)/i;
        const anyMatch = cleanUrl.match(anyKeyPattern);
        if (anyMatch) {
            return anyMatch[1].toUpperCase();
        }
        return null;
    }
    /**
     * Find Jira URLs in text (PR description)
     * Handles various formats including markdown links
     */
    static findJiraUrls(text) {
        const urls = [];
        // Pattern 1: Direct URLs with atlassian.net
        const directUrlPattern = /https?:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/[^\s\])"'>]*/gi;
        const directMatches = text.match(directUrlPattern) || [];
        urls.push(...directMatches);
        // Pattern 2: Markdown links [text](url)
        const markdownLinkPattern = /\[([^\]]*)\]\((https?:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/[^)]+)\)/gi;
        let mdMatch;
        while ((mdMatch = markdownLinkPattern.exec(text)) !== null) {
            if (!urls.includes(mdMatch[2])) {
                urls.push(mdMatch[2]);
            }
        }
        // Pattern 3: HTML links <a href="url">
        const htmlLinkPattern = /href=["'](https?:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/[^"']+)["']/gi;
        let htmlMatch;
        while ((htmlMatch = htmlLinkPattern.exec(text)) !== null) {
            if (!urls.includes(htmlMatch[1])) {
                urls.push(htmlMatch[1]);
            }
        }
        // Clean URLs - remove trailing punctuation
        return urls.map(url => url.replace(/[)\]}>.,;:!?]+$/, ''));
    }
    /**
     * Convert Atlassian Document Format (ADF) to plain text
     * Extracts both text content AND URLs from links
     */
    adfToText(adf) {
        if (!adf || !adf.content) {
            return '';
        }
        const extractText = (node) => {
            // Handle text nodes - check for link marks
            if (node.type === 'text') {
                let text = node.text || '';
                // Check if this text has a link mark - append the URL
                if (node.marks && Array.isArray(node.marks)) {
                    for (const mark of node.marks) {
                        if (mark.type === 'link' && mark.attrs?.href) {
                            // Append the URL after the text so it's visible
                            text = `${text} (${mark.attrs.href})`;
                        }
                    }
                }
                return text;
            }
            // Handle inlineCard (smart links) - these contain URLs
            if (node.type === 'inlineCard' && node.attrs?.url) {
                return node.attrs.url + ' ';
            }
            // Handle blockCard (embed cards)
            if (node.type === 'blockCard' && node.attrs?.url) {
                return node.attrs.url + '\n';
            }
            // Handle media nodes (attachments)
            if (node.type === 'media' && node.attrs) {
                // Media can have external URLs or be attachments
                if (node.attrs.url) {
                    return node.attrs.url + ' ';
                }
            }
            // Handle mediaGroup
            if (node.type === 'mediaGroup' && node.content) {
                return node.content.map(extractText).join(' ');
            }
            // Recursively process content
            if (node.content && Array.isArray(node.content)) {
                return node.content.map(extractText).join('');
            }
            return '';
        };
        return adf.content.map((node) => {
            const text = extractText(node);
            // Add newlines after paragraphs and headings
            if (['paragraph', 'heading'].includes(node.type)) {
                return text + '\n';
            }
            return text;
        }).join('').trim();
    }
    /**
     * Fetch a Jira issue by key
     */
    async getIssue(issueKey) {
        const response = await this.client.get(`/issue/${issueKey}`, {
            params: {
                fields: 'summary,description,comment',
            },
        });
        return response.data;
    }
    /**
     * Get all text content from a Jira ticket (description + comments)
     * This is used for LLM processing to find Figma links
     */
    async getTicketContent(issueKey) {
        const issue = await this.getIssue(issueKey);
        // Debug: Log raw ADF structure to see what API returns
        console.log(`=== RAW ADF DESCRIPTION (${issueKey}) ===`);
        console.log(JSON.stringify(issue.fields.description, null, 2));
        console.log(`=== END RAW ADF ===`);
        const descriptionText = this.adfToText(issue.fields.description);
        const commentsText = (issue.fields.comment?.comments || [])
            .map(comment => this.adfToText(comment.body));
        const fullText = [
            `Ticket: ${issue.key}`,
            `Summary: ${issue.fields.summary}`,
            '',
            'Description:',
            descriptionText,
            '',
            'Comments:',
            ...commentsText.map((c, i) => `Comment ${i + 1}: ${c}`),
        ].join('\n');
        return {
            key: issue.key,
            summary: issue.fields.summary,
            descriptionText,
            commentsText,
            fullText,
        };
    }
    /**
     * Add a comment to a Jira issue
     * The comment body should be in Atlassian Document Format (ADF)
     */
    async addComment(issueKey, commentBody) {
        // Convert plain text to ADF format
        const paragraphs = commentBody.split('\n\n').filter(p => p.trim());
        const adfContent = paragraphs.map(paragraph => {
            const lines = paragraph.split('\n');
            const content = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Only add non-empty text nodes
                if (line) {
                    content.push({ type: 'text', text: line });
                }
                // Add hardBreak between lines (not after the last line)
                if (i < lines.length - 1) {
                    content.push({ type: 'hardBreak' });
                }
            }
            // If paragraph has no content, add a space to avoid empty paragraph
            if (content.length === 0) {
                content.push({ type: 'text', text: ' ' });
            }
            return {
                type: 'paragraph',
                content,
            };
        });
        // Ensure we have at least one paragraph
        if (adfContent.length === 0) {
            adfContent.push({
                type: 'paragraph',
                content: [{ type: 'text', text: commentBody || ' ' }],
            });
        }
        const adfBody = {
            type: 'doc',
            version: 1,
            content: adfContent,
        };
        console.log(`Posting comment to Jira ticket ${issueKey}`);
        console.log(`ADF Body: ${JSON.stringify(adfBody, null, 2)}`);
        try {
            await this.client.post(`/issue/${issueKey}/comment`, {
                body: adfBody,
            });
            console.log(`Successfully posted comment to ${issueKey}`);
        }
        catch (error) {
            console.error(`Failed to post comment to ${issueKey}:`, error.response?.data || error.message);
            throw error;
        }
    }
    /**
     * Build the Jira issue URL
     */
    getIssueUrl(issueKey) {
        return `${this.baseUrl}/browse/${issueKey}`;
    }
}
exports.JiraClient = JiraClient;
//# sourceMappingURL=client.js.map