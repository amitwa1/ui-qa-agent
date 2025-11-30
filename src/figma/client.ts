import axios, { AxiosInstance } from 'axios';

export interface FigmaConfig {
  accessToken: string;
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

export class FigmaClient {
  private client: AxiosInstance;

  constructor(config: FigmaConfig) {
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
    const response = await this.client.get(`/files/${fileKey}`);
    return response.data;
  }

  /**
   * Get specific nodes from a file
   */
  async getNodes(fileKey: string, nodeIds: string[]): Promise<any> {
    const response = await this.client.get(`/files/${fileKey}/nodes`, {
      params: {
        ids: nodeIds.join(','),
      },
    });
    return response.data;
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
  }

  /**
   * Download image data from a Figma image URL
   */
  async downloadImage(imageUrl: string): Promise<Buffer> {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  /**
   * Get images for a Figma URL (convenience method)
   * If a specific node is in the URL, gets that node's image
   * Otherwise, gets the first page/frame
   */
  async getImagesFromUrl(figmaUrl: string): Promise<FigmaImageResult[]> {
    const fileInfo = FigmaClient.parseFigmaUrl(figmaUrl);
    if (!fileInfo) {
      throw new Error(`Invalid Figma URL: ${figmaUrl}`);
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

    return results;
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



