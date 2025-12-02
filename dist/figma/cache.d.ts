export interface CacheConfig {
    cacheDir?: string;
    ttlMs?: number;
}
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    url: string;
}
export declare class FigmaCache {
    private cacheDir;
    private ttlMs;
    constructor(config?: CacheConfig);
    /**
     * Generate a cache key from a Figma URL
     */
    private getCacheKey;
    /**
     * Get the file path for a cache entry
     */
    private getCachePath;
    /**
     * Ensure the cache directory exists
     */
    private ensureCacheDir;
    /**
     * Check if a cache entry is still valid (not expired)
     */
    private isValid;
    /**
     * Get a cached value for a Figma URL
     */
    get<T>(url: string): T | null;
    /**
     * Store a value in the cache for a Figma URL
     */
    set<T>(url: string, data: T): void;
    /**
     * Delete a cache entry
     */
    delete(url: string): void;
    /**
     * Clear all cache entries
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        entries: number;
        totalSize: number;
    };
}
//# sourceMappingURL=cache.d.ts.map