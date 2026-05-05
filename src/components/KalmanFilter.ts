export class KalmanFilter {
  x: number;
  v: number;
  p: number;
  q: number;
  r: number;
  lastPredict: number;
  lastMeasurementTime: number;
  lastMeasurementX: number;

  constructor(initial_x: number, q = 0.01, r = 4.0, p = 1.0) {
    this.x = initial_x; // State estimate (position)
    this.v = 0;         // State estimate (velocity)
    this.p = p;         // Estimate uncertainty
    this.q = q;         // Process noise
    this.r = r;         // Measurement noise
    const now = Date.now();
    this.lastPredict = now;
    this.lastMeasurementTime = now;
    this.lastMeasurementX = initial_x;
  }

  predict(isOccluded = false) {
    const now = Date.now();
    const dt = Math.min((now - this.lastPredict) / 1000, 0.1); // Cap dt to prevent huge jumps
    
    if (isOccluded) {
      this.v *= 0.8; // Apply friction: slow down prediction when occluded
    }
    
    this.x += this.v * dt;
    this.p += this.q;
    this.lastPredict = now;
    return this.x;
  }

  update(measurement: number) {
    const now = Date.now();
    const dt = Math.min((now - this.lastMeasurementTime) / 1000, 0.1);
    
    // Simple velocity estimation (Exponential Moving Average)
    if (dt > 0.01) { // Only update velocity if enough time has passed
      const measured_v = (measurement - this.lastMeasurementX) / dt;
      const capped_v = Math.max(-2000, Math.min(2000, measured_v));
      this.v = this.v * 0.5 + capped_v * 0.5; // More responsive velocity
    }

    // Measurement update step
    const k = this.p / (this.p + this.r);
    this.x += k * (measurement - this.x);
    this.p *= (1 - k);
    
    this.lastMeasurementTime = now;
    this.lastMeasurementX = measurement;
    
    return this.x;
  }
}

export interface TrackedObject {
  id: number;
  bbox: [number, number, number, number]; // Smoothed bbox
  filters: [KalmanFilter, KalmanFilter, KalmanFilter, KalmanFilter]; // Filters for [x, y, width, height]
  lastSeen: number;
  firstSeen: number;
  path: [number, number][];
  crossed: boolean;
  hitStreak: number; // Used to filter out false positives (requires N consecutive detections)
  lostFrames: number; // Track buffering: number of consecutive frames without detection
  score: number; // Confidence score
  subClass?: string; // e.g., 'Adult', 'Child', 'Car', 'Truck'
  class?: string;
}
