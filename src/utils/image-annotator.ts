/**
 * Image annotation utility for marking issues on screenshots
 * Uses sharp for image manipulation
 */

import sharp from 'sharp';

export interface BoundingBox {
  x: number;      // Left edge as percentage (0-100)
  y: number;      // Top edge as percentage (0-100)
  width: number;  // Width as percentage (0-100)
  height: number; // Height as percentage (0-100)
}

export interface AnnotationMarker {
  number: number;
  boundingBox: BoundingBox;
  severity: 'critical' | 'major' | 'minor';
  description: string;
}

// Colors for different severity levels
const SEVERITY_COLORS = {
  critical: { r: 220, g: 38, b: 38 },   // Red
  major: { r: 234, g: 88, b: 12 },      // Orange  
  minor: { r: 234, g: 179, b: 8 },      // Yellow
};

/**
 * Creates an SVG circle with a number inside
 */
function createMarkerSVG(
  number: number,
  severity: 'critical' | 'major' | 'minor',
  size: number = 32
): string {
  const color = SEVERITY_COLORS[severity];
  const strokeColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
  const fillColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.85)`;
  const textColor = 'white';
  const fontSize = size * 0.5;
  
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" 
              fill="${fillColor}" 
              stroke="${strokeColor}" 
              stroke-width="2"/>
      <text x="${size/2}" y="${size/2}" 
            font-family="Arial, sans-serif" 
            font-size="${fontSize}px" 
            font-weight="bold"
            fill="${textColor}" 
            text-anchor="middle" 
            dominant-baseline="central">${number}</text>
    </svg>
  `;
}

/**
 * Creates an SVG rectangle outline for highlighting an area
 */
function createHighlightSVG(
  width: number,
  height: number,
  severity: 'critical' | 'major' | 'minor'
): string {
  const color = SEVERITY_COLORS[severity];
  const strokeColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
  const fillColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.15)`;
  
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${width - 4}" height="${height - 4}" 
            fill="${fillColor}" 
            stroke="${strokeColor}" 
            stroke-width="3"
            stroke-dasharray="8,4"
            rx="4" ry="4"/>
    </svg>
  `;
}

/**
 * Annotate an image with numbered markers at issue locations
 * @param imageBase64 - The base64 encoded image to annotate
 * @param markers - Array of markers to place on the image
 * @returns Base64 encoded annotated image
 */
export async function annotateImage(
  imageBase64: string,
  markers: AnnotationMarker[]
): Promise<string> {
  // Filter out markers without valid bounding boxes
  const validMarkers = markers.filter(m => 
    m.boundingBox && 
    typeof m.boundingBox.x === 'number' &&
    typeof m.boundingBox.y === 'number'
  );

  if (validMarkers.length === 0) {
    // No valid markers, return original image
    return imageBase64;
  }

  // Decode base64 to buffer
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 800;
  const imageHeight = metadata.height || 600;

  // Calculate marker size based on image dimensions (min 24px, max 48px)
  const markerSize = Math.min(48, Math.max(24, Math.round(Math.min(imageWidth, imageHeight) * 0.04)));

  // Create composite operations for each marker
  const compositeOps: sharp.OverlayOptions[] = [];

  for (const marker of validMarkers) {
    const bb = marker.boundingBox;
    
    // Convert percentage coordinates to pixel coordinates
    const pixelX = Math.round((bb.x / 100) * imageWidth);
    const pixelY = Math.round((bb.y / 100) * imageHeight);
    const pixelWidth = Math.round((bb.width / 100) * imageWidth);
    const pixelHeight = Math.round((bb.height / 100) * imageHeight);

    // Add highlight rectangle if we have width and height
    if (bb.width > 0 && bb.height > 0 && pixelWidth > 10 && pixelHeight > 10) {
      const highlightSVG = createHighlightSVG(pixelWidth, pixelHeight, marker.severity);
      const highlightBuffer = Buffer.from(highlightSVG);
      
      compositeOps.push({
        input: highlightBuffer,
        left: Math.max(0, Math.min(imageWidth - pixelWidth, pixelX)),
        top: Math.max(0, Math.min(imageHeight - pixelHeight, pixelY)),
      });
    }

    // Add numbered marker circle
    const markerSVG = createMarkerSVG(marker.number, marker.severity, markerSize);
    const markerBuffer = Buffer.from(markerSVG);

    // Position the marker at the top-left corner of the bounding box (offset slightly)
    const markerX = Math.max(0, Math.min(imageWidth - markerSize, pixelX - markerSize / 2));
    const markerY = Math.max(0, Math.min(imageHeight - markerSize, pixelY - markerSize / 2));

    compositeOps.push({
      input: markerBuffer,
      left: Math.round(markerX),
      top: Math.round(markerY),
    });
  }

  // Apply all composites to the image
  const annotatedBuffer = await sharp(imageBuffer)
    .composite(compositeOps)
    .png()
    .toBuffer();

  // Return as base64
  return annotatedBuffer.toString('base64');
}

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

export async function createAnnotatedImage(
  imageBase64: string,
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    description: string;
    location: string;
    boundingBox?: BoundingBox;
  }>
): Promise<AnnotationResult> {
  // Create markers from issues that have bounding boxes
  const markers: AnnotationMarker[] = [];
  const legend: AnnotationResult['legend'] = [];
  
  let markerNumber = 1;
  for (const issue of issues) {
    if (issue.boundingBox && 
        typeof issue.boundingBox.x === 'number' && 
        typeof issue.boundingBox.y === 'number') {
      markers.push({
        number: markerNumber,
        boundingBox: issue.boundingBox,
        severity: issue.severity,
        description: issue.description,
      });
      legend.push({
        number: markerNumber,
        severity: issue.severity,
        description: issue.description,
        location: issue.location,
      });
      markerNumber++;
    }
  }

  if (markers.length === 0) {
    return {
      annotatedImageBase64: imageBase64,
      legend: [],
      hasAnnotations: false,
    };
  }

  const annotatedImageBase64 = await annotateImage(imageBase64, markers);
  
  return {
    annotatedImageBase64,
    legend,
    hasAnnotations: true,
  };
}
