/**
 * Camera Capture System for Robot 3D View
 *
 * Provides functionality to capture screenshots from the robot's perspective
 * and from the top-down view. These images are used for:
 * 1. Displaying what the robot "sees" in the agent panel
 * 2. Providing visual context to the AI for decision making
 * 3. Debugging and understanding robot behavior
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CameraCapture {
  id: string;
  timestamp: number;
  type: 'follower' | 'topdown' | 'robot-pov';
  dataUrl: string;  // Base64 encoded image
  width: number;
  height: number;
  robotPose?: {
    x: number;
    y: number;
    rotation: number;
  };
  analysis?: CameraAnalysis;
}

export interface CameraAnalysis {
  frontObstacle: boolean;
  frontDistance: number;
  leftClear: boolean;
  rightClear: boolean;
  objectsDetected: string[];
  dominantColors: string[];
}

export interface CaptureConfig {
  width?: number;
  height?: number;
  quality?: number;  // 0.0 to 1.0 for JPEG
  format?: 'png' | 'jpeg';
}

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS CAPTURE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Capture a screenshot from a Three.js canvas
 */
export function captureCanvasScreenshot(
  canvas: HTMLCanvasElement,
  config: CaptureConfig = {}
): string {
  const {
    width = 320,
    height = 240,
    quality = 0.8,
    format = 'jpeg',
  } = config;

  // Create a temporary canvas for resizing
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;

  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context for screenshot');
  }

  // Draw the 3D canvas onto the temp canvas, resizing as needed
  ctx.drawImage(canvas, 0, 0, width, height);

  // Convert to data URL
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return tempCanvas.toDataURL(mimeType, quality);
}

/**
 * Generate a unique capture ID
 */
export function generateCaptureId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA CAPTURE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class CameraCaptureManager {
  private captures: Map<string, CameraCapture> = new Map();
  private maxCaptures: number = 50;
  private canvasRef: HTMLCanvasElement | null = null;
  private robotPovCanvasRef: HTMLCanvasElement | null = null;
  private listeners: Set<(capture: CameraCapture) => void> = new Set();

  /**
   * Register the main 3D canvas (arena view) as a fallback for capturing
   */
  registerCanvas(canvas: HTMLCanvasElement): void {
    this.canvasRef = canvas;
  }

  /**
   * Unregister the main canvas
   */
  unregisterCanvas(): void {
    this.canvasRef = null;
  }

  /**
   * Register the robot's first-person POV canvas (takes priority over main canvas)
   */
  registerRobotPovCanvas(canvas: HTMLCanvasElement): void {
    this.robotPovCanvasRef = canvas;
  }

  /**
   * Unregister the robot POV canvas
   */
  unregisterRobotPovCanvas(): void {
    this.robotPovCanvasRef = null;
  }

  /**
   * Check if canvas is registered
   */
  hasCanvas(): boolean {
    return this.robotPovCanvasRef !== null || this.canvasRef !== null;
  }

  /**
   * Capture a screenshot from the current canvas state.
   * For 'robot-pov' captures, prefers the dedicated robot POV canvas over the main arena canvas.
   */
  capture(
    type: CameraCapture['type'],
    robotPose?: CameraCapture['robotPose'],
    config?: CaptureConfig
  ): CameraCapture | null {
    // For robot-pov captures, prefer the dedicated robot POV canvas
    const canvas = (type === 'robot-pov' && this.robotPovCanvasRef)
      ? this.robotPovCanvasRef
      : (this.robotPovCanvasRef || this.canvasRef);

    if (!canvas) {
      console.warn('No canvas registered for camera capture');
      return null;
    }

    try {
      const dataUrl = captureCanvasScreenshot(canvas, config);
      const capture: CameraCapture = {
        id: generateCaptureId(),
        timestamp: Date.now(),
        type,
        dataUrl,
        width: config?.width ?? 320,
        height: config?.height ?? 240,
        robotPose,
      };

      // Store capture
      this.captures.set(capture.id, capture);

      // Cleanup old captures
      this.cleanupOldCaptures();

      // Notify listeners
      this.notifyListeners(capture);

      return capture;
    } catch (error) {
      console.error('Failed to capture camera screenshot:', error);
      return null;
    }
  }

  /**
   * Get a capture by ID
   */
  getCapture(id: string): CameraCapture | undefined {
    return this.captures.get(id);
  }

  /**
   * Get the most recent capture
   */
  getLatestCapture(): CameraCapture | undefined {
    let latest: CameraCapture | undefined;
    for (const capture of this.captures.values()) {
      if (!latest || capture.timestamp > latest.timestamp) {
        latest = capture;
      }
    }
    return latest;
  }

  /**
   * Get all captures of a specific type
   */
  getCapturesByType(type: CameraCapture['type']): CameraCapture[] {
    return Array.from(this.captures.values())
      .filter((c) => c.type === type)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Add a listener for new captures
   */
  addListener(listener: (capture: CameraCapture) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a new capture
   */
  private notifyListeners(capture: CameraCapture): void {
    for (const listener of this.listeners) {
      try {
        listener(capture);
      } catch (error) {
        console.error('Camera capture listener error:', error);
      }
    }
  }

  /**
   * Cleanup old captures to prevent memory bloat
   */
  private cleanupOldCaptures(): void {
    if (this.captures.size <= this.maxCaptures) return;

    // Sort by timestamp and remove oldest
    const sorted = Array.from(this.captures.entries())
      .sort(([, a], [, b]) => b.timestamp - a.timestamp);

    for (let i = this.maxCaptures; i < sorted.length; i++) {
      this.captures.delete(sorted[i][0]);
    }
  }

  /**
   * Clear all captures
   */
  clearCaptures(): void {
    this.captures.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

export const cameraCaptureManager = new CameraCaptureManager();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a data URL from a canvas element
 */
export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' = 'jpeg',
  quality: number = 0.8
): string {
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(mimeType, quality);
}

/**
 * Resize an image data URL
 */
export function resizeImageDataUrl(
  dataUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D context'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default cameraCaptureManager;
