export class MotionDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastData: ImageData | null = null;
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
    
    if (this.lastData) {
      for (let i = 0; i < currentData.data.length; i += 4) {
        const r1 = currentData.data[i], g1 = currentData.data[i+1], b1 = currentData.data[i+2];
        const r2 = this.lastData.data[i], g2 = this.lastData.data[i+1], b2 = this.lastData.data[i+2];
        
        const luma1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        const luma2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
        
        const diff = Math.abs(luma1 - luma2);
        
        if (diff > 16) { // Sensitivity threshold
          diffPixelCount++;
        }
      }
    }
    
    this.lastData = currentData;
    
    const totalPixels = this.width * this.height;
    const changedRatio = diffPixelCount / totalPixels;
    
    // Scale raw score: 10% screen change = 100% motion score.
    // Tiny camera noise is ignored so the UI does not chatter at rest.
    const rawScore = changedRatio < 0.003 ? 0 : changedRatio * 100 * 10;
    
    this.emaScore = (rawScore * 0.45) + (this.emaScore * 0.55);
    
    return Math.min(100, this.emaScore); 
  }
}
