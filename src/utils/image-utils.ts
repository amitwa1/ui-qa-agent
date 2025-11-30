import axios from 'axios';

/**
 * Download an image from a URL and return as Buffer
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(response.data);
}

/**
 * Download an image and convert to base64
 */
export async function downloadImageAsBase64(url: string): Promise<string> {
  const buffer = await downloadImage(url);
  return buffer.toString('base64');
}

/**
 * Get the media type from an image URL or buffer
 */
export function getImageMediaType(url: string): string {
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
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, { timeout: 10000 });
    const contentType = response.headers['content-type'] || '';
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * Resize base64 image if it's too large (for API limits)
 * Note: This is a placeholder - actual implementation would need sharp or similar
 */
export function estimateBase64Size(base64: string): number {
  // Base64 encoding increases size by ~33%
  return Math.ceil(base64.length * 0.75);
}

/**
 * Check if image is within size limits for Bedrock
 */
export function isImageWithinLimits(base64: string, maxSizeMB: number = 20): boolean {
  const sizeBytes = estimateBase64Size(base64);
  const sizeMB = sizeBytes / (1024 * 1024);
  return sizeMB <= maxSizeMB;
}


