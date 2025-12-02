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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FigmaCache = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const DEFAULT_CACHE_DIR = '.figma-cache';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
class FigmaCache {
    constructor(config = {}) {
        this.cacheDir = config.cacheDir || DEFAULT_CACHE_DIR;
        this.ttlMs = config.ttlMs || DEFAULT_TTL_MS;
        this.ensureCacheDir();
    }
    /**
     * Generate a cache key from a Figma URL
     */
    getCacheKey(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }
    /**
     * Get the file path for a cache entry
     */
    getCachePath(key) {
        return path.join(this.cacheDir, `${key}.json`);
    }
    /**
     * Ensure the cache directory exists
     */
    ensureCacheDir() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
                console.log(`[FigmaCache] Created cache directory: ${this.cacheDir}`);
            }
        }
        catch (error) {
            console.warn(`[FigmaCache] Could not create cache directory: ${error}`);
        }
    }
    /**
     * Check if a cache entry is still valid (not expired)
     */
    isValid(entry) {
        const age = Date.now() - entry.timestamp;
        return age < this.ttlMs;
    }
    /**
     * Get a cached value for a Figma URL
     */
    get(url) {
        const key = this.getCacheKey(url);
        const cachePath = this.getCachePath(key);
        try {
            if (!fs.existsSync(cachePath)) {
                return null;
            }
            const content = fs.readFileSync(cachePath, 'utf-8');
            const entry = JSON.parse(content);
            if (!this.isValid(entry)) {
                console.log(`[FigmaCache] Cache expired for: ${url}`);
                this.delete(url);
                return null;
            }
            console.log(`[FigmaCache] Cache hit for: ${url}`);
            return entry.data;
        }
        catch (error) {
            console.warn(`[FigmaCache] Error reading cache: ${error}`);
            return null;
        }
    }
    /**
     * Store a value in the cache for a Figma URL
     */
    set(url, data) {
        const key = this.getCacheKey(url);
        const cachePath = this.getCachePath(key);
        const entry = {
            data,
            timestamp: Date.now(),
            url,
        };
        try {
            fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
            console.log(`[FigmaCache] Cached response for: ${url}`);
        }
        catch (error) {
            console.warn(`[FigmaCache] Error writing cache: ${error}`);
        }
    }
    /**
     * Delete a cache entry
     */
    delete(url) {
        const key = this.getCacheKey(url);
        const cachePath = this.getCachePath(key);
        try {
            if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
            }
        }
        catch (error) {
            console.warn(`[FigmaCache] Error deleting cache: ${error}`);
        }
    }
    /**
     * Clear all cache entries
     */
    clear() {
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
        }
        catch (error) {
            console.warn(`[FigmaCache] Error clearing cache: ${error}`);
        }
    }
    /**
     * Get cache statistics
     */
    getStats() {
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
        }
        catch (error) {
            return { entries: 0, totalSize: 0 };
        }
    }
}
exports.FigmaCache = FigmaCache;
//# sourceMappingURL=cache.js.map