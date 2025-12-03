/**
 * Image annotation utility for marking issues on screenshots
 * Uses sharp for image manipulation
 */
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface AnnotationMarker {
    number: number;
    boundingBox: BoundingBox;
    severity: 'critical' | 'major' | 'minor';
    description: string;
}
/**
 * Annotate an image with numbered markers at issue locations
 * @param imageBase64 - The base64 encoded image to annotate
 * @param markers - Array of markers to place on the image
 * @returns Base64 encoded annotated image
 */
export declare function annotateImage(imageBase64: string, markers: AnnotationMarker[]): Promise<string>;
/**
 * Generate annotated image and return along with a legend
 */
export interface AnnotationResult {
    annotatedImageBase64: string;
    legend: Array<{
        number: number;
        severity: 'critical' | 'major' | 'minor';
        description: string;
        location: string;
    }>;
    hasAnnotations: boolean;
}
export declare function createAnnotatedImage(imageBase64: string, issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    description: string;
    location: string;
    boundingBox?: BoundingBox;
}>): Promise<AnnotationResult>;
//# sourceMappingURL=image-annotator.d.ts.map