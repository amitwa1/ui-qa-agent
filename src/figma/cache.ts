import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheConfig {
  cacheDir?: string;
  ttlMs?: number; // Time-to-live in milliseconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  url: string;
}

const DEFAULT_CACHE_DIR = '.figma-cache';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class FigmaCache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(config: CacheConfig = {}) {
    this.cacheDir = config.cacheDir || DEFAULT_CACHE_DIR;
    this.ttlMs = config.ttlMs || DEFAULT_TTL_MS;
    this.ensureCacheDir();
  }

  /**
   * Generate a cache key from a Figma URL
   */
  private getCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Get the file path for a cache entry
   */
  private getCachePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Ensure the cache directory exists
   */
  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        console.log(`[FigmaCache] Created cache directory: ${this.cacheDir}`);
      }
    } catch (error) {
      console.warn(`[FigmaCache] Could not create cache directory: ${error}`);
    }
  }

  /**
   * Check if a cache entry is still valid (not expired)
   */
  private isValid(entry: CacheEntry<unknown>): boolean {
    const age = Date.now() - entry.timestamp;
    return age < this.ttlMs;
  }

  /**
   * Get a cached value for a Figma URL
   */
  get<T>(url: string): T | null {
    const key = this.getCacheKey(url);
    const cachePath = this.getCachePath(key);

    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const content = fs.readFileSync(cachePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      if (!this.isValid(entry)) {
        console.log(`[FigmaCache] Cache expired for: ${url}`);
        this.delete(url);
        return null;
      }

      console.log(`[FigmaCache] Cache hit for: ${url}`);
      return entry.data;
    } catch (error) {
      console.warn(`[FigmaCache] Error reading cache: ${error}`);
      return null;
    }
  }

  /**
   * Store a value in the cache for a Figma URL
   */
  set<T>(url: string, data: T): void {
    const key = this.getCacheKey(url);
    const cachePath = this.getCachePath(key);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      url,
    };

    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
      console.log(`[FigmaCache] Cached response for: ${url}`);
    } catch (error) {
      console.warn(`[FigmaCache] Error writing cache: ${error}`);
    }
  }

  /**
   * Delete a cache entry
   */
  delete(url: string): void {
    const key = this.getCacheKey(url);
    const cachePath = this.getCachePath(key);

    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      console.warn(`[FigmaCache] Error deleting cache: ${error}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        }
        console.log(`[FigmaCache] Cleared ${files.length} cache entries`);
      }
    } catch (error) {
      console.warn(`[FigmaCache] Error clearing cache: ${error}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; totalSize: number } {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        return { entries: 0, totalSize: 0 };
      }

      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      let totalSize = 0;

      for (const file of files) {
        const stat = fs.statSync(path.join(this.cacheDir, file));
        totalSize += stat.size;
      }

      return { entries: files.length, totalSize };
    } catch (error) {
      return { entries: 0, totalSize: 0 };
    }
  }
}
