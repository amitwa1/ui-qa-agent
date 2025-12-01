import axios, { AxiosInstance, AxiosError } from 'axios';
import { FigmaCache } from './cache';

export interface FigmaConfig {
  accessToken: string;
  useMock?: boolean; // Enable mock mode to skip real API calls
  cacheDir?: string; // Directory for caching Figma responses
  cacheTtlMs?: number; // Cache TTL in milliseconds (default: 24 hours)
}

export interface FigmaFileInfo {
  fileKey: string;
  nodeId?: string;
  fileName?: string;
}

export interface FigmaImageResult {
  nodeId: string;
  imageUrl: string;
  imageData?: Buffer;
}

export interface FigmaNodeInfo {
  id: string;
  name: string;
  type: string;
}

// Retry configuration
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2000; // 2 seconds
const MAX_DELAY_MS = 60000; // 60 seconds

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic for rate limiting (429 errors)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Only retry on 429 (rate limit) errors
      if (axiosError.response?.status === 429) {
        lastError = error as Error;
        
        // Extract and log all Figma rate limit headers
        const headers = axiosError.response.headers;
        const retryAfter = headers['retry-after'];
        const planTier = headers['x-figma-plan-tier'];
        const rateLimitType = headers['x-figma-rate-limit-type'];
        const upgradeLink = headers['x-figma-upgrade-link'];
        
        console.log(`[Figma] ========== RATE LIMIT INFO ==========`);
        console.log(`[Figma] Context: ${context}`);
        console.log(`[Figma] Retry-After: ${retryAfter} seconds`);
        console.log(`[Figma] X-Figma-Plan-Tier: ${planTier}`);
        console.log(`[Figma] X-Figma-Rate-Limit-Type: ${rateLimitType} (low=Viewer/Collab, high=Full/Dev)`);
        console.log(`[Figma] X-Figma-Upgrade-Link: ${upgradeLink}`);
        console.log(`[Figma] ========================================`);
        
        if (attempt < maxRetries) {
          // Use Retry-After header if provided and reasonable
          let waitTime: number;
          const retrySeconds = parseInt(retryAfter as string, 10);
          
          if (!isNaN(retrySeconds) && retrySeconds > 0) {
            // Use Figma's suggested retry time, but cap at MAX_DELAY_MS
            waitTime = Math.min(retrySeconds * 1000, MAX_DELAY_MS);
            console.log(`[Figma] Using Retry-After value: ${retrySeconds}s (capped to ${waitTime / 1000}s)`);
          } else {
            // Fallback to exponential backoff
            waitTime = Math.min(
              INITIAL_DELAY_MS * Math.pow(2, attempt),
              MAX_DELAY_MS
            );
            console.log(`[Figma] Using exponential backoff: ${waitTime / 1000}s`);
          }
          
          console.log(`[Figma] Attempt ${attempt + 1}/${maxRetries + 1}. Waiting ${waitTime / 1000}s before retry...`);
          await sleep(waitTime);
          continue;
        } else {
          console.log(`[Figma] Max retries (${maxRetries}) reached. Giving up.`);
        }
      }
      
      // For non-429 errors or final attempt, throw immediately
      throw error;
    }
  }
  
  throw lastError || new Error(`Failed after ${maxRetries} retries`);
}

// A simple 1x1 red PNG image as base64 for mock mode
const MOCK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

export class FigmaClient {
  private client: AxiosInstance;
  private useMock: boolean;
  private cache: FigmaCache;

  constructor(config: FigmaConfig) {
    this.useMock = config.useMock || false;
    this.cache = new FigmaCache({
      cacheDir: config.cacheDir,
      ttlMs: config.cacheTtlMs,
    });
    
    if (this.useMock) {
      console.log('[Figma] 🎭 MOCK MODE ENABLED - No real API calls will be made');
    }
    
    const stats = this.cache.getStats();
    console.log(`[Figma] Cache initialized with ${stats.entries} existing entries`);
    
    this.client = axios.create({
      baseURL: 'https://api.figma.com/v1',
      headers: {
        'X-Figma-Token': config.accessToken,
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Parse a Figma URL and extract file key and node ID
   * Supports formats like:
   * - https://www.figma.com/file/ABC123/FileName
   * - https://www.figma.com/design/ABC123/FileName?node-id=1-2
   * - https://www.figma.com/file/ABC123/FileName?node-id=1%3A2
   * - https://www.figma.com/proto/ABC123/FileName
   */
  static parseFigmaUrl(url: string): FigmaFileInfo | null {
    try {
      const urlObj = new URL(url);
      
      // Check if it's a Figma URL
      if (!urlObj.hostname.includes('figma.com')) {
        return null;
      }

      // Extract file key from path
      // Patterns: /file/KEY/, /design/KEY/, /proto/KEY/
      const pathMatch = urlObj.pathname.match(/\/(file|design|proto)\/([a-zA-Z0-9]+)/);
      if (!pathMatch) {
        return null;
      }

      const fileKey = pathMatch[2];

      // Extract node ID from query params
      let nodeId: string | undefined;
      const nodeIdParam = urlObj.searchParams.get('node-id');
      if (nodeIdParam) {
        // Node IDs in URLs use - but API uses :
        // Decode URL encoding (e.g., %3A to :)
        nodeId = decodeURIComponent(nodeIdParam).replace('-', ':');
      }

      // Extract file name from path
      const pathParts = urlObj.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1] || undefined;

      return {
        fileKey,
        nodeId,
        fileName: fileName ? decodeURIComponent(fileName) : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a URL is a valid Figma URL
   */
  static isFigmaUrl(url: string): boolean {
    return this.parseFigmaUrl(url) !== null;
  }

  /**
   * Get file information
   */
  async getFile(fileKey: string): Promise<any> {
    return withRetry(
      async () => {
        const response = await this.client.get(`/files/${fileKey}`);
        return response.data;
      },
      `getFile(${fileKey})`
    );
  }

  /**
   * Get specific nodes from a file
   */
  async getNodes(fileKey: string, nodeIds: string[]): Promise<any> {
    return withRetry(
      async () => {
        const response = await this.client.get(`/files/${fileKey}/nodes`, {
          params: {
            ids: nodeIds.join(','),
          },
        });
        return response.data;
      },
      `getNodes(${fileKey}, ${nodeIds.join(',')})`
    );
  }

  /**
   * Get rendered images for specific nodes
   */
  async getNodeImages(
    fileKey: string, 
    nodeIds: string[],
    options: {
      format?: 'jpg' | 'png' | 'svg' | 'pdf';
      scale?: number;
    } = {}
  ): Promise<Map<string, string>> {
    const { format = 'png', scale = 2 } = options;

    return withRetry(
      async () => {
        const response = await this.client.get(`/images/${fileKey}`, {
          params: {
            ids: nodeIds.join(','),
            format,
            scale,
          },
        });

        const images = new Map<string, string>();
        if (response.data.images) {
          for (const [nodeId, imageUrl] of Object.entries(response.data.images)) {
            if (imageUrl) {
              images.set(nodeId, imageUrl as string);
            }
          }
        }

        return images;
      },
      `getNodeImages(${fileKey}, ${nodeIds.join(',')})`
    );
  }

  /**
   * Download image data from a Figma image URL
   */
  async downloadImage(imageUrl: string): Promise<Buffer> {
    return withRetry(
      async () => {
        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
        });
        return Buffer.from(response.data);
      },
      `downloadImage`
    );
  }

  /**
   * Get images for a Figma URL (convenience method)
   * If a specific node is in the URL, gets that node's image
   * Otherwise, gets the first page/frame
   * Results are cached to avoid hitting Figma API rate limits
   */
  async getImagesFromUrl(figmaUrl: string): Promise<FigmaImageResult[]> {
    const fileInfo = FigmaClient.parseFigmaUrl(figmaUrl);
    if (!fileInfo) {
      throw new Error(`Invalid Figma URL: ${figmaUrl}`);
    }

    // Mock mode - return fake image data
    if (this.useMock) {
      console.log(`[Figma] 🎭 Mock: Returning fake image for ${figmaUrl}`);
      const mockNodeId = fileInfo.nodeId || '0:1';
      return [{
        nodeId: mockNodeId,
        imageUrl: `mock://figma-image/${fileInfo.fileKey}/${mockNodeId}`,
      }];
    }

    // Check cache first
    const cacheKey = `images:${figmaUrl}`;
    const cachedResults = this.cache.get<FigmaImageResult[]>(cacheKey);
    if (cachedResults) {
      console.log(`[Figma] Using cached images for: ${figmaUrl}`);
      return cachedResults;
    }

    let nodeIds: string[];
    
    if (fileInfo.nodeId) {
      // Use the specific node from the URL
      nodeIds = [fileInfo.nodeId];
    } else {
      // Get the file and find the first page's children (frames)
      const file = await this.getFile(fileInfo.fileKey);
      const firstPage = file.document.children[0];
      if (firstPage && firstPage.children && firstPage.children.length > 0) {
        // Get first few frames (limit to 5 to avoid too many)
        nodeIds = firstPage.children.slice(0, 5).map((child: FigmaNodeInfo) => child.id);
      } else {
        nodeIds = [firstPage.id];
      }
    }

    const imageUrls = await this.getNodeImages(fileInfo.fileKey, nodeIds);
    
    const results: FigmaImageResult[] = [];
    for (const [nodeId, imageUrl] of imageUrls) {
      results.push({
        nodeId,
        imageUrl,
      });
    }

    // Cache the results
    this.cache.set(cacheKey, results);

    return results;
  }
  
  /**
   * Check if mock mode is enabled
   */
  isMockMode(): boolean {
    return this.useMock;
  }
  
  /**
   * Get mock image as base64 (for testing)
   */
  getMockImageBase64(): string {
    return MOCK_IMAGE_BASE64;
  }

  /**
   * Get images with downloaded data
   */
  async getImagesWithData(figmaUrl: string): Promise<FigmaImageResult[]> {
    const results = await this.getImagesFromUrl(figmaUrl);
    
    // Download all images in parallel
    await Promise.all(
      results.map(async (result) => {
        result.imageData = await this.downloadImage(result.imageUrl);
      })
    );

    return results;
  }
}


