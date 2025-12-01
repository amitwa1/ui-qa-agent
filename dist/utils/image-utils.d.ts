/**
 * Download an image from a URL and return as Buffer
 */
export declare function downloadImage(url: string): Promise<Buffer>;
/**
 * Download an image and convert to base64
 */
export declare function downloadImageAsBase64(url: string): Promise<string>;
/**
 * Get the media type from an image URL or buffer
 */
export declare function getImageMediaType(url: string): string;
/**
 * Validate that a URL points to an image
 */
export declare function validateImageUrl(url: string): Promise<boolean>;
/**
 * Resize base64 image if it's too large (for API limits)
 * Note: This is a placeholder - actual implementation would need sharp or similar
 */
export declare function estimateBase64Size(base64: string): number;
/**
 * Check if image is within size limits for Bedrock
 */
export declare function isImageWithinLimits(base64: string, maxSizeMB?: number): boolean;
//# sourceMappingURL=image-utils.d.ts.map