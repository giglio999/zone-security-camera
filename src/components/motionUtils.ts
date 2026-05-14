export class MotionDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastData: ImageData | null = null;
  private motionMask: Uint8Array | null = null;
  private width = 128;
  private height = 96;
  private emaScore = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  detect(video: HTMLVideoElement): number {
    if (video.videoWidth === 0 || video.videoHeight === 0) return 0;
    
    this.ctx.drawImage(video, 0, 0, this.width, this.height);
    const currentData = this.ctx.getImageData(0, 0, this.width, this.height);
    
    let diffPixelCount = 0;
    const motionMask = new Uint8Array(this.width * this.height);
    
    if (this.lastData) {
      for (let i = 0, pixelIndex = 0; i < currentData.data.length; i += 4, pixelIndex++) {
        const r1 = currentData.data[i], g1 = currentData.data[i+1], b1 = currentData.data[i+2];
        const r2 = this.lastData.data[i], g2 = this.lastData.data[i+1], b2 = this.lastData.data[i+2];
        
        const luma1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        const luma2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
        
        const diff = Math.abs(luma1 - luma2);
        
        if (diff > 16) { // Sensitivity threshold
          diffPixelCount++;
          motionMask[pixelIndex] = 1;
        }
      }
    }
    
    this.lastData = currentData;
    this.motionMask = motionMask;
    
    const totalPixels = this.width * this.height;
    const changedRatio = diffPixelCount / totalPixels;
    
    // Scale raw score: 10% screen change = 100% motion score.
    // Tiny camera noise is ignored so the UI does not chatter at rest.
    const rawScore = changedRatio < 0.003 ? 0 : changedRatio * 100 * 10;
    
    this.emaScore = (rawScore * 0.45) + (this.emaScore * 0.55);
    
    return Math.min(100, this.emaScore); 
  }

  getBoxMotionScore(
    box: [number, number, number, number],
    sourceWidth: number,
    sourceHeight: number
  ): number {
    if (!this.motionMask || sourceWidth <= 0 || sourceHeight <= 0) return 0;

    const [x, y, width, height] = box;
    const left = Math.max(0, Math.floor((x / sourceWidth) * this.width));
    const top = Math.max(0, Math.floor((y / sourceHeight) * this.height));
    const right = Math.min(this.width, Math.ceil(((x + width) / sourceWidth) * this.width));
    const bottom = Math.min(this.height, Math.ceil(((y + height) / sourceHeight) * this.height));

    if (right <= left || bottom <= top) return 0;

    let changedPixels = 0;
    let totalPixels = 0;

    for (let yy = top; yy < bottom; yy++) {
      for (let xx = left; xx < right; xx++) {
        totalPixels++;
        changedPixels += this.motionMask[yy * this.width + xx];
      }
    }

    if (totalPixels === 0) return 0;

    return (changedPixels / totalPixels) * 100 * 10;
  }
}
