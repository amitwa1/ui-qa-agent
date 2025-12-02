"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadImage = downloadImage;
exports.downloadImageAsBase64 = downloadImageAsBase64;
exports.getImageMediaType = getImageMediaType;
exports.validateImageUrl = validateImageUrl;
exports.estimateBase64Size = estimateBase64Size;
exports.isImageWithinLimits = isImageWithinLimits;
const axios_1 = __importDefault(require("axios"));
/**
 * Download an image from a URL and return as Buffer
 */
async function downloadImage(url) {
    const response = await axios_1.default.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
    });
    return Buffer.from(response.data);
}
/**
 * Download an image and convert to base64
 */
async function downloadImageAsBase64(url) {
    const buffer = await downloadImage(url);
    return buffer.toString('base64');
}
/**
 * Get the media type from an image URL or buffer
 */
function getImageMediaType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.png') || lowerUrl.includes('png')) {
        return 'image/png';
    }
    if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('jpeg')) {
        return 'image/jpeg';
    }
    if (lowerUrl.includes('.gif')) {
        return 'image/gif';
    }
    if (lowerUrl.includes('.webp')) {
        return 'image/webp';
    }
    // Default to PNG
    return 'image/png';
}
/**
 * Validate that a URL points to an image
 */
async function validateImageUrl(url) {
    try {
        const response = await axios_1.default.head(url, { timeout: 10000 });
        const contentType = response.headers['content-type'] || '';
        return contentType.startsWith('image/');
    }
    catch {
        return false;
    }
}
/**
 * Resize base64 image if it's too large (for API limits)
 * Note: This is a placeholder - actual implementation would need sharp or similar
 */
function estimateBase64Size(base64) {
    // Base64 encoding increases size by ~33%
    return Math.ceil(base64.length * 0.75);
}
/**
 * Check if image is within size limits for Bedrock
 */
function isImageWithinLimits(base64, maxSizeMB = 20) {
    const sizeBytes = estimateBase64Size(base64);
    const sizeMB = sizeBytes / (1024 * 1024);
    return sizeMB <= maxSizeMB;
}
//# sourceMappingURL=image-utils.js.map