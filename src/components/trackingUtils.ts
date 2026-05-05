import { TrackedObject } from './KalmanFilter';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
// @ts-ignore
import munkres from 'munkres-js';

// Helper function to calculate Intersection over Union (IoU)
export function calculateIoU(box1: [number, number, number, number], box2: [number, number, number, number]) {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;

  const xA = Math.max(x1, x2);
  const yA = Math.max(y1, y2);
  const xB = Math.min(x1 + w1, x2 + w2);
  const yB = Math.min(y1 + h1, y2 + h2);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (interArea === 0) return 0;

  const box1Area = w1 * h1;
  const box2Area = w2 * h2;
  
  return interArea / (box1Area + box2Area - interArea);
}

export function matchTracks(
  currentTracked: Map<number, TrackedObject>,
  targets: cocoSsd.DetectedObject[],
  predictedTracks: { id: number, bbox: [number, number, number, number] }[]
) {
  const trackIds = Array.from<number>(currentTracked.keys());
  const numTracks = trackIds.length;
  const numTargets = targets.length;

  const matches: { trackId: number, predIdx: number }[] = [];
  const unassignedTracks = new Set<number>(trackIds);
  const unassignedPredictions = new Set<number>(Array.from<unknown, number>({ length: numTargets }, (_, i) => i));

  if (numTracks > 0 && numTargets > 0) {
    // Build cost matrix
    const costMatrix: number[][] = [];
    for (let i = 0; i < numTracks; i++) {
      const pTrack = predictedTracks[i];
      const track = currentTracked.get(pTrack.id)!;
      const row: number[] = [];
      for (let j = 0; j < numTargets; j++) {
        const pred = targets[j];
        const pBbox = pred.bbox as [number, number, number, number];
        
        // Calculate IoU using predicted bounding box
        const iou = calculateIoU(pTrack.bbox, pBbox);
        
        // Calculate distance penalty
        const pCenterX = pBbox[0] + pBbox[2] / 2;
        const pCenterY = pBbox[1] + pBbox[3] / 2;
        const tCenterX = pTrack.bbox[0] + pTrack.bbox[2] / 2;
        const tCenterY = pTrack.bbox[1] + pTrack.bbox[3] / 2;
        const dist = Math.hypot(pCenterX - tCenterX, pCenterY - tCenterY);
        const predictedDiag = Math.hypot(pTrack.bbox[2], pTrack.bbox[3]);
        const targetDiag = Math.hypot(pBbox[2], pBbox[3]);
        const lostAllowance = Math.min(track.lostFrames, 45) * 0.045;
        const maxDist = Math.max(70, Math.max(predictedDiag, targetDiag) * (1.05 + lostAllowance));
        
        // Calculate shape penalties
        const pArea = pBbox[2] * pBbox[3];
        const tArea = track.bbox[2] * track.bbox[3];
        const sizeRatio = Math.max(pArea / tArea, tArea / pArea);
        const sizePenalty = Math.min(0.55, Math.max(0, Math.log(sizeRatio)) * 0.14);

        const pAspect = pBbox[2] / pBbox[3];
        const tAspect = track.bbox[2] / track.bbox[3];
        const aspectRatio = Math.max(pAspect / tAspect, tAspect / pAspect);
        const aspectPenalty = Math.min(0.35, Math.max(0, Math.log(aspectRatio)) * 0.09);
        
        let cost = 100.0;
        const centerCost = dist / Math.max(1, maxDist);
        if (iou > 0) {
          cost = (1.0 - iou) * 0.7 + centerCost + sizePenalty + aspectPenalty;
        } else if (dist < maxDist) {
          cost = 1.15 + centerCost + sizePenalty + aspectPenalty;
        }
        
        row.push(cost);
      }
      costMatrix.push(row);
    }

    // Apply Hungarian algorithm
    const indices = munkres(costMatrix) as [number, number][];

    // Filter valid matches
    for (const [tIdx, pIdx] of indices) {
      const cost = costMatrix[tIdx][pIdx];
      if (cost < 3.05) {
        matches.push({ trackId: trackIds[tIdx], predIdx: pIdx });
        unassignedTracks.delete(trackIds[tIdx]);
        unassignedPredictions.delete(pIdx);
      }
    }
  }

  return { matches, unassignedTracks, unassignedPredictions };
}
