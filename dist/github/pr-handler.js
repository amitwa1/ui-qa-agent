"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRHandler = void 0;
const github = __importStar(require("@actions/github"));
const axios_1 = __importDefault(require("axios"));
class PRHandler {
    constructor(token, owner, repo) {
        this.octokit = github.getOctokit(token);
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Get PR information
     */
    async getPRInfo(pullNumber) {
        const { data: pr } = await this.octokit.rest.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: pullNumber,
        });
        return {
            owner: this.owner,
            repo: this.repo,
            pullNumber,
            title: pr.title,
            body: pr.body || '',
            headSha: pr.head.sha,
        };
    }
    /**
     * Extract image URLs from markdown text
     * Looks for patterns like:
     * - ![alt](url)
     * - <img src="url">
     * - Direct GitHub user-content URLs
     */
    static extractImagesFromMarkdown(text) {
        const images = [];
        // Markdown image pattern: ![alt](url)
        const mdImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let mdMatch;
        while ((mdMatch = mdImagePattern.exec(text)) !== null) {
            images.push({
                alt: mdMatch[1],
                url: mdMatch[2],
            });
        }
        // HTML img tag pattern
        const htmlImgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let htmlMatch;
        while ((htmlMatch = htmlImgPattern.exec(text)) !== null) {
            images.push({
                alt: '',
                url: htmlMatch[1],
            });
        }
        // GitHub user-content URLs (direct paste)
        const githubImagePattern = /https:\/\/(?:user-images\.githubusercontent\.com|github\.com\/[^/]+\/[^/]+\/assets)\/[^\s"')]+/g;
        let ghMatch;
        while ((ghMatch = githubImagePattern.exec(text)) !== null) {
            // Check if not already captured
            if (!images.some(img => img.url === ghMatch[0])) {
                images.push({
                    alt: '',
                    url: ghMatch[0],
                });
            }
        }
        return images;
    }
    /**
     * Get all comments on a PR
     */
    async getPRComments(pullNumber) {
        const { data: comments } = await this.octokit.rest.issues.listComments({
            owner: this.owner,
            repo: this.repo,
            issue_number: pullNumber,
        });
        return comments.map(comment => ({
            id: comment.id,
            body: comment.body || '',
            user: comment.user?.login || 'unknown',
            createdAt: comment.created_at,
            imageUrls: PRHandler.extractImagesFromMarkdown(comment.body || '').map(img => img.url),
        }));
    }
    /**
     * Find comments with screenshots (images)
     */
    async findScreenshotComments(pullNumber) {
        const comments = await this.getPRComments(pullNumber);
        return comments.filter(comment => comment.imageUrls.length > 0);
    }
    /**
     * Post a comment on the PR
     */
    async postComment(pullNumber, body) {
        const { data: comment } = await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: pullNumber,
            body,
        });
        return comment.id;
    }
    /**
     * Update an existing comment
     */
    async updateComment(commentId, body) {
        await this.octokit.rest.issues.updateComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: commentId,
            body,
        });
    }
    /**
     * Find an existing comment by a marker string
     */
    async findCommentByMarker(pullNumber, marker) {
        const comments = await this.getPRComments(pullNumber);
        return comments.find(comment => comment.body.includes(marker)) || null;
    }
    /**
     * Post or update a comment (update if exists with marker, otherwise create)
     */
    async postOrUpdateComment(pullNumber, body, marker) {
        const existingComment = await this.findCommentByMarker(pullNumber, marker);
        if (existingComment) {
            await this.updateComment(existingComment.id, body);
            return existingComment.id;
        }
        return this.postComment(pullNumber, body);
    }
    /**
     * Post a request for screenshots
     */
    async requestScreenshots(pullNumber, figmaLinks) {
        const figmaListItems = figmaLinks.map(link => `- ${link}`).join('\n');
        const marker = '## 📸 UI QA: Screenshots Required';
        const body = `${marker}

I found the following Figma design link(s) in the linked Jira ticket:

${figmaListItems}

**Please upload screenshots of your implementation** by replying to this comment with images.

### How to add screenshots:
1. Take screenshots of your implemented UI
2. Paste or drag-and-drop them into a reply to this comment
3. I'll automatically compare them against the Figma designs

---
*UI QA Agent will analyze your screenshots and provide feedback.*`;
        return this.postOrUpdateComment(pullNumber, body, marker);
    }
    /**
     * Post comparison results with detailed component analysis (similar to ux_validator_ui.py)
     */
    async postComparisonResults(pullNumber, results) {
        const statusEmoji = {
            pass: '✅',
            warning: '⚠️',
            fail: '❌',
        };
        const severityEmoji = {
            critical: '🔴',
            major: '🟠',
            minor: '🟡',
        };
        const marker = '## 🔍 UI QA Analysis Results';
        let body = `${marker}\n\n`;
        // Overall summary
        const passCount = results.filter(r => r.overallMatch === 'pass').length;
        const failCount = results.filter(r => r.overallMatch === 'fail').length;
        const warningCount = results.filter(r => r.overallMatch === 'warning').length;
        if (failCount > 0) {
            body += `### Overall Status: ❌ Issues Found\n\n`;
        }
        else if (warningCount > 0) {
            body += `### Overall Status: ⚠️ Minor Issues\n\n`;
        }
        else {
            body += `### Overall Status: ✅ All Checks Passed\n\n`;
        }
        body += `| Status | Count |\n|--------|-------|\n`;
        body += `| ✅ Pass | ${passCount} |\n`;
        body += `| ⚠️ Warning | ${warningCount} |\n`;
        body += `| ❌ Fail | ${failCount} |\n\n`;
        // Individual results
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const emoji = statusEmoji[result.overallMatch];
            const detailed = result.detailedResult;
            body += `<details>\n`;
            body += `<summary>${emoji} Comparison ${i + 1}: ${result.matchPercentage}% match</summary>\n\n`;
            body += `**Figma Design:** ${result.figmaUrl}\n\n`;
            body += `**Summary:** ${result.summary}\n\n`;
            // Display annotated image with issue markers if available
            if (result.annotatedImage?.hasAnnotations) {
                body += `### 🖼️ Annotated Screenshot\n\n`;
                body += `The screenshot below has numbered markers indicating the location of each issue:\n\n`;
                body += `![Annotated Screenshot](data:image/png;base64,${result.annotatedImage.annotatedImageBase64})\n\n`;
                // Add legend with numbered issues
                body += `### 📍 Issue Legend\n\n`;
                body += `| # | Severity | Issue | Location |\n`;
                body += `|---|----------|-------|----------|\n`;
                for (const item of result.annotatedImage.legend) {
                    const sevEmoji = item.severity === 'critical' ? '🔴' : item.severity === 'major' ? '🟠' : '🟡';
                    // Truncate long descriptions
                    const desc = item.description.length > 80 ? item.description.substring(0, 77) + '...' : item.description;
                    body += `| **${item.number}** | ${sevEmoji} ${item.severity} | ${desc} | ${item.location} |\n`;
                }
                body += `\n`;
            }
            // If we have detailed results, show the structured analysis
            if (detailed) {
                // Summary metrics (similar to ux_validator_ui.py metrics display)
                body += `### 📊 Validation Summary\n\n`;
                body += `| Metric | Value |\n|--------|-------|\n`;
                body += `| Components Found | ${detailed.summary.components_found}/${detailed.summary.total_reference_components} |\n`;
                body += `| Missing Components | ${detailed.summary.components_missing} |\n`;
                body += `| Extra Components | ${detailed.summary.extra_components_count} |\n`;
                body += `| Grammar Issues | ${detailed.summary.grammar_issues_count} |\n`;
                body += `| Color Issues | ${detailed.summary.color_issues_count} |\n`;
                body += `| Typography Issues | ${detailed.summary.typography_issues_count} |\n`;
                body += `| Overlapping Elements | ${detailed.summary.overlapping_elements_count} |\n`;
                body += `| **Total Issues** | **${detailed.summary.total_issues}** |\n\n`;
                // Issue Summary with expandable details (similar to ux_validator_ui.py)
                body += `### 📋 Issue Summary\n\n`;
                // Component Issues
                const componentIssueCount = detailed.summary.components_missing + detailed.summary.extra_components_count;
                if (componentIssueCount > 0) {
                    body += `<details>\n<summary>❌ Component Issues: ${componentIssueCount}</summary>\n\n`;
                    // Missing components
                    const missingComponents = detailed.reference_components.filter(c => !c.found_in_input);
                    if (missingComponents.length > 0) {
                        body += `**Missing from input:**\n`;
                        for (const comp of missingComponents) {
                            body += `- ❌ **${comp.name}** (${comp.type}): ${comp.description}\n`;
                            if (comp.issues.missing_component_note) {
                                body += `  - ${comp.issues.missing_component_note}\n`;
                            }
                        }
                        body += `\n`;
                    }
                    // Extra components
                    if (detailed.extra_components_in_input.length > 0) {
                        body += `**Extra in input (not in reference):**\n`;
                        for (const comp of detailed.extra_components_in_input) {
                            const sevIcon = comp.severity === 'major' ? '🔴' : '🟡';
                            body += `- ${sevIcon} **${comp.name}** (${comp.type}): ${comp.description}\n`;
                        }
                        body += `\n`;
                    }
                    body += `</details>\n\n`;
                }
                else {
                    body += `✅ **Component Issues:** 0\n\n`;
                }
                // Grammar Issues
                const allGrammarIssues = detailed.global_issues.grammar_issues || [];
                if (allGrammarIssues.length > 0) {
                    body += `<details>\n<summary>❌ Grammar Issues: ${allGrammarIssues.length}</summary>\n\n`;
                    for (const issue of allGrammarIssues) {
                        body += `- ${issue}\n`;
                    }
                    body += `\n</details>\n\n`;
                }
                else {
                    body += `✅ **Grammar Issues:** 0\n\n`;
                }
                // Color Issues
                const allColorIssues = detailed.global_issues.color_issues || [];
                const bgIssue = detailed.global_issues.background_color;
                if (allColorIssues.length > 0 || bgIssue?.has_difference) {
                    const colorCount = allColorIssues.length + (bgIssue?.has_difference ? 1 : 0);
                    body += `<details>\n<summary>⚠️ Color Issues: ${colorCount}</summary>\n\n`;
                    if (bgIssue?.has_difference) {
                        body += `**Background Color Difference:**\n`;
                        body += `- Reference: ${bgIssue.reference_color}\n`;
                        body += `- Input: ${bgIssue.input_color}\n`;
                        body += `- Note: ${bgIssue.note}\n\n`;
                    }
                    if (allColorIssues.length > 0) {
                        body += `**Other Color Issues:**\n`;
                        for (const issue of allColorIssues) {
                            body += `- ${issue}\n`;
                        }
                    }
                    body += `\n</details>\n\n`;
                }
                else {
                    body += `✅ **Color Issues:** 0\n\n`;
                }
                // Typography Issues
                const allTypoIssues = detailed.global_issues.typography_issues || [];
                if (allTypoIssues.length > 0) {
                    body += `<details>\n<summary>⚠️ Typography Issues: ${allTypoIssues.length}</summary>\n\n`;
                    for (const issue of allTypoIssues) {
                        body += `- ${issue}\n`;
                    }
                    body += `\n</details>\n\n`;
                }
                else {
                    body += `✅ **Typography Issues:** 0\n\n`;
                }
                // Overlapping Elements
                if (detailed.overlapping_elements.length > 0) {
                    body += `<details>\n<summary>⚠️ Overlapping Elements: ${detailed.overlapping_elements.length}</summary>\n\n`;
                    for (const overlap of detailed.overlapping_elements) {
                        const sevIcon = overlap.severity === 'major' ? '🔴' : '🟡';
                        body += `- ${sevIcon} **${overlap.element_name}** overlaps with **${overlap.overlaps_with}**\n`;
                        body += `  - Location: ${overlap.location}\n`;
                    }
                    body += `\n</details>\n\n`;
                }
                // Component-by-Component Analysis (similar to ux_validator_ui.py)
                body += `### 🔍 Reference Component Analysis\n\n`;
                body += `<details>\n<summary>Click to expand component-by-component analysis</summary>\n\n`;
                for (const comp of detailed.reference_components) {
                    const compStatus = comp.status;
                    const compIcon = !comp.found_in_input ? '❌' :
                        compStatus === 'pass' ? '✅' :
                            compStatus === 'warning' ? '⚠️' : '❌';
                    const issueCount = (comp.issues.grammar_issues?.length || 0) +
                        (comp.issues.text_mismatch?.length || 0) +
                        (comp.issues.major_color_differences?.length || 0) +
                        (comp.issues.missing_fields?.length || 0) +
                        (comp.issues.typography_issues?.length || 0) +
                        (comp.issues.missing_component ? 1 : 0);
                    const statusText = !comp.found_in_input ? 'MISSING' : `${issueCount} issue(s)`;
                    body += `<details>\n<summary>${compIcon} <strong>${comp.name}</strong> (${comp.type}) - ${statusText}</summary>\n\n`;
                    body += `📍 **Description:** ${comp.description}\n\n`;
                    if (!comp.found_in_input || comp.issues.missing_component) {
                        body += `❌ **MISSING FROM INPUT**\n`;
                        if (comp.issues.missing_component_note) {
                            body += `${comp.issues.missing_component_note}\n`;
                        }
                    }
                    else {
                        // Grammar & Text Issues
                        if ((comp.issues.grammar_issues?.length || 0) > 0 || (comp.issues.text_mismatch?.length || 0) > 0) {
                            body += `**📝 Grammar & Text Issues:**\n`;
                            for (const issue of comp.issues.grammar_issues || []) {
                                body += `- ${issue}\n`;
                            }
                            for (const mismatch of comp.issues.text_mismatch || []) {
                                body += `- ${mismatch}\n`;
                            }
                            body += `\n`;
                        }
                        // Color Issues
                        if ((comp.issues.major_color_differences?.length || 0) > 0) {
                            body += `**🎨 Major Color Differences:**\n`;
                            for (const issue of comp.issues.major_color_differences) {
                                body += `- ${issue}\n`;
                            }
                            body += `\n`;
                        }
                        // Missing Fields
                        if ((comp.issues.missing_fields?.length || 0) > 0) {
                            body += `**📋 Missing Fields:**\n`;
                            for (const field of comp.issues.missing_fields) {
                                body += `- ${field}\n`;
                            }
                            body += `\n`;
                        }
                        if (comp.issues.field_notes) {
                            body += `**ℹ️ Field Notes:** ${comp.issues.field_notes}\n\n`;
                        }
                        // Typography Issues
                        if ((comp.issues.typography_issues?.length || 0) > 0) {
                            body += `**🔤 Typography Issues:**\n`;
                            for (const issue of comp.issues.typography_issues) {
                                body += `- ${issue}\n`;
                            }
                            body += `\n`;
                        }
                        if (issueCount === 0) {
                            body += `✅ No issues found for this component!\n`;
                        }
                    }
                    body += `\n</details>\n\n`;
                }
                body += `</details>\n\n`;
                // Extra Components Section
                if (detailed.extra_components_in_input.length > 0) {
                    body += `### ➕ Extra Components in Input\n\n`;
                    body += `Components found in the input that are NOT in the Figma reference:\n\n`;
                    for (const comp of detailed.extra_components_in_input) {
                        const sevIcon = comp.severity === 'major' ? '🔴' : '🟡';
                        body += `- ${sevIcon} **${comp.name}** (${comp.type}): ${comp.description}\n`;
                    }
                    body += `\n`;
                }
                // Conclusion
                if (detailed.conclusion) {
                    body += `### 🎯 Conclusion\n\n`;
                    body += `${detailed.conclusion}\n\n`;
                }
            }
            else {
                // Fallback to legacy format if no detailed results
                if (result.issues.length > 0) {
                    body += `#### Issues Found:\n\n`;
                    body += `| Severity | Category | Description | Location |\n`;
                    body += `|----------|----------|-------------|----------|\n`;
                    for (const issue of result.issues) {
                        const sevEmoji = severityEmoji[issue.severity] || '⚪';
                        body += `| ${sevEmoji} ${issue.severity} | ${issue.category} | ${issue.description} | ${issue.location} |\n`;
                    }
                    body += '\n';
                }
            }
            if (result.recommendations.length > 0) {
                body += `#### Recommendations:\n\n`;
                for (const rec of result.recommendations) {
                    body += `- ${rec}\n`;
                }
                body += '\n';
            }
            body += `</details>\n\n`;
        }
        body += `---\n*Analysis performed by UI QA Agent*`;
        return this.postOrUpdateComment(pullNumber, body, marker);
    }
    /**
     * Download an image from a URL and return as base64
     */
    async downloadImageAsBase64(imageUrl) {
        const response = await axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
        });
        return Buffer.from(response.data).toString('base64');
    }
    /**
     * Set commit status
     */
    async setCommitStatus(sha, state, description, context = 'UI QA Agent') {
        await this.octokit.rest.repos.createCommitStatus({
            owner: this.owner,
            repo: this.repo,
            sha,
            state,
            description,
            context,
        });
    }
}
exports.PRHandler = PRHandler;
//# sourceMappingURL=pr-handler.js.map