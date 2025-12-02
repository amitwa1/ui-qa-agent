export interface ScreenshotDesignMatch {
    screenshotIndex: number;
    figmaIndex: number;
    confidence: number;
    reasoning: string;
}
export interface ScreenshotMatchResult {
    matches: ScreenshotDesignMatch[];
    unmatchedScreenshots: number[];
    unmatchedFigmaDesigns: number[];
}
//# sourceMappingURL=index.d.ts.map