import { TrackedObject } from './KalmanFilter';

const ANIMAL_CLASSES = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'];
const VEHICLE_CLASSES = ['car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'];

function getTrackStyle(className: string) {
  if (className === 'person') {
    return { color: '#ef4444', label: 'INTRUDER', fill: 'rgba(239, 68, 68, 0.15)' }; // Rose
  }
  if (ANIMAL_CLASSES.includes(className)) {
    return { color: '#3b82f6', label: `ANIMAL (${className})`, fill: 'rgba(59, 130, 246, 0.15)' }; // Blue
  }
  if (VEHICLE_CLASSES.includes(className)) {
    return { color: '#f59e0b', label: `VEHICLE (${className})`, fill: 'rgba(245, 158, 11, 0.15)' }; // Amber
  }
  return { color: '#64748b', label: `OBJECT (${className})`, fill: 'rgba(100, 116, 139, 0.15)' }; // Slate
}

export function drawTracks(
  ctx: CanvasRenderingContext2D,
  visibleTracks: TrackedObject[],
  showPaths: boolean
) {
  if (visibleTracks.length === 0) return;

  // 1. Draw all bounding boxes
  visibleTracks.forEach(track => {
    const style = getTrackStyle(track.class || 'unknown');
    const [x, y, width, height] = track.bbox;
    
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    
    // Fill
    ctx.fillStyle = style.fill;
    ctx.fill();
    
    // Draw corner accents
    const cornerSize = 10;
    // Top Left
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    // Top Right
    ctx.moveTo(x + width - cornerSize, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + cornerSize);
    // Bottom Left
    ctx.moveTo(x, y + height - cornerSize);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + cornerSize, y + height);
    // Bottom Right
    ctx.moveTo(x + width - cornerSize, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - cornerSize);
    
    ctx.stroke();
  });

  // 1.5 Draw paths
  if (showPaths) {
    visibleTracks.forEach(track => {
      if (track.path.length > 1) {
        const style = getTrackStyle(track.class || 'unknown');
        ctx.strokeStyle = style.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(track.path[0][0], track.path[0][1]);
        for (let i = 1; i < track.path.length; i++) {
          ctx.lineTo(track.path[i][0], track.path[i][1]);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    });
  }

  // 2. Draw Labels and Confidence Indicators
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  
  visibleTracks.forEach(track => {
    const style = getTrackStyle(track.class || 'unknown');
    const [x, y] = track.bbox;
    const text = `ID:${track.id} ${style.label}`;
    const textWidth = ctx.measureText(text).width;
    
    const labelHeight = 22;
    const labelY = y - labelHeight;
    
    // Main label background
    ctx.fillStyle = style.color;
    ctx.fillRect(x, labelY, textWidth + 16, labelHeight);
    
    // Text
    ctx.fillStyle = track.class === 'person' ? '#ffffff' : '#0a0a0c'; // Ensure readable text
    ctx.fillText(text, x + 8, labelY + labelHeight / 2);

    // Confidence indicator background (dark)
    const confBarWidth = 36;
    ctx.fillStyle = 'rgba(10, 10, 12, 0.9)';
    ctx.fillRect(x + textWidth + 16, labelY, confBarWidth, labelHeight);

    // Confidence fill bar
    const scoreColor = track.score > 0.80 ? style.color : track.score > 0.65 ? '#fbbf24' : '#ef4444';
    ctx.fillStyle = scoreColor;
    ctx.fillRect(x + textWidth + 16, labelY + labelHeight - 3, confBarWidth * track.score, 3);
    
    // Confidence Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${(track.score * 100).toFixed(0)}%`, x + textWidth + 20, labelY + labelHeight / 2 - 1);
  });
}

export function drawHeatmap(
  heatmapCtx: CanvasRenderingContext2D,
  visibleTracks: TrackedObject[],
  width: number,
  height: number,
  showHeatmap: boolean
) {
  if (showHeatmap) {
    visibleTracks.forEach(track => {
      const [x, y, w, h] = track.bbox;
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const radius = Math.max(w, h) * 0.3;
      
      if (radius > 0) {
        const gradient = heatmapCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        // Persons red heatmap, others blue heatmap
        if (track.class === 'person') {
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.25)'); // red
          gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.1)'); 
        } else {
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)'); // blue
          gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.1)');
        }
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        heatmapCtx.fillStyle = gradient;
        heatmapCtx.beginPath();
        heatmapCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        heatmapCtx.fill();
      }
    });

    // Fade heatmap smoothly
    heatmapCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    heatmapCtx.globalCompositeOperation = 'destination-out';
    heatmapCtx.fillRect(0, 0, width, height);
    heatmapCtx.globalCompositeOperation = 'source-over';
  } else {
    heatmapCtx.clearRect(0, 0, width, height);
  }
}
