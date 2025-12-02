export interface FigmaConfig {
    accessToken: string;
    useMock?: boolean;
    cacheDir?: string;
    cacheTtlMs?: number;
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
export declare class FigmaClient {
    private client;
    private useMock;
    private cache;
    constructor(config: FigmaConfig);
    /**
     * Parse a Figma URL and extract file key and node ID
     * Supports formats like:
     * - https://www.figma.com/file/ABC123/FileName
     * - https://www.figma.com/design/ABC123/FileName?node-id=1-2
     * - https://www.figma.com/file/ABC123/FileName?node-id=1%3A2
     * - https://www.figma.com/proto/ABC123/FileName
     */
    static parseFigmaUrl(url: string): FigmaFileInfo | null;
    /**
     * Check if a URL is a valid Figma URL
     */
    static isFigmaUrl(url: string): boolean;
    /**
     * Get file information
     */
    getFile(fileKey: string): Promise<any>;
    /**
     * Get specific nodes from a file
     */
    getNodes(fileKey: string, nodeIds: string[]): Promise<any>;
    /**
     * Get rendered images for specific nodes
     */
    getNodeImages(fileKey: string, nodeIds: string[], options?: {
        format?: 'jpg' | 'png' | 'svg' | 'pdf';
        scale?: number;
    }): Promise<Map<string, string>>;
    /**
     * Download image data from a Figma image URL
     */
    downloadImage(imageUrl: string): Promise<Buffer>;
    /**
     * Get images for a Figma URL (convenience method)
     * If a specific node is in the URL, gets that node's image
     * Otherwise, gets the first page/frame
     * Results are cached to avoid hitting Figma API rate limits
     */
    getImagesFromUrl(figmaUrl: string): Promise<FigmaImageResult[]>;
    /**
     * Check if mock mode is enabled
     */
    isMockMode(): boolean;
    /**
     * Get mock image as base64 (for testing)
     */
    getMockImageBase64(): string;
    /**
     * Get images with downloaded data
     */
    getImagesWithData(figmaUrl: string): Promise<FigmaImageResult[]>;
}
//# sourceMappingURL=client.d.ts.map