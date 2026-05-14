import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import { Activity, Camera, Loader2, VideoOff } from 'lucide-react';
import { KalmanFilter, TrackedObject } from './KalmanFilter';
import { matchTracks } from './trackingUtils';
import { MotionDetector } from './motionUtils';

export type AlertType = 'restricted' | 'loitering' | 'offHours';

export interface RestrictedZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SecurityAlert {
  type: AlertType;
  message: string;
  trackId: number;
  timestamp: number;
}

type PersonDetectionSource = 'body' | 'face';

interface PersonDetection extends cocoSsd.DetectedObject {
  bbox: [number, number, number, number];
  source: PersonDetectionSource;
}

interface DetectionModels {
  coco: cocoSsd.ObjectDetection;
  face: blazeface.BlazeFaceModel;
}

interface StationaryState {
  anchor: [number, number];
  filteredPoint: [number, number];
  since: number;
  movingFrames: number;
}

interface CameraTrackerProps {
  isCameraOn: boolean;
  restrictedZone: RestrictedZone | null;
  isDrawingZone: boolean;
  loiteringSeconds: number;
  offHoursMode: boolean;
  onPeopleCountUpdate: (count: number) => void;
  onZoneChange: (zone: RestrictedZone | null) => void;
  onAlert: (alert: SecurityAlert) => void;
  onActiveRuleMessagesUpdate: (messages: string[]) => void;
}

const PERSON_CONFIDENCE_THRESHOLD = 0.42;
const FACE_CONFIDENCE_THRESHOLD = 0.72;
const MIN_HITS_TO_DISPLAY = 2;
const MAX_LOST_FRAMES = 180;
const MAX_TIME_LOST_MS = 7000;
const VISIBLE_TRACK_HOLD_MS = 7000;
const TRACK_MOTION_SUPPORT_THRESHOLD = 3.5;
const STILL_MIN_PX = 18;
const STILL_FILTER_ALPHA = 0.28;
const MOVING_FRAMES_TO_RESET = 4;
const STRONG_MOVEMENT_MULTIPLIER = 2.4;
const RULE_EVENT_COOLDOWN_MS = 5000;
const MOTION_ALERT_ON_THRESHOLD = 9;
const MOTION_ALERT_OFF_THRESHOLD = 3;
const MOTION_ALERT_HOLD_MS = 1800;
const HUMAN_MOTION_SUPPRESSION_MS = 1200;

const ALERT_MESSAGES: Record<AlertType, string> = {
  restricted: 'INTRUSÃO DETECTADA',
  loitering: 'PESSOA PARADA',
  offHours: 'MOVIMENTO FORA DO HORÁRIO'
};

function getCenter(box: [number, number, number, number]) {
  return {
    x: box[0] + box[2] / 2,
    y: box[1] + box[3] / 2
  };
}

function getBottomCenter(box: [number, number, number, number]) {
  return {
    x: box[0] + box[2] / 2,
    y: box[1] + box[3]
  };
}

function getLoiteringPoint(box: [number, number, number, number]) {
  return {
    x: box[0] + box[2] / 2,
    y: box[1] + box[3] * 0.82
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isPointInsideZone(point: { x: number; y: number }, zone: RestrictedZone) {
  return point.x >= zone.x
    && point.x <= zone.x + zone.width
    && point.y >= zone.y
    && point.y <= zone.y + zone.height;
}

function isPointInsideBox(point: { x: number; y: number }, box: [number, number, number, number]) {
  return point.x >= box[0]
    && point.x <= box[0] + box[2]
    && point.y >= box[1]
    && point.y <= box[1] + box[3];
}

function normalizeZone(zone: RestrictedZone): RestrictedZone {
  const x = zone.width < 0 ? zone.x + zone.width : zone.x;
  const y = zone.height < 0 ? zone.y + zone.height : zone.y;
  return {
    x,
    y,
    width: Math.abs(zone.width),
    height: Math.abs(zone.height)
  };
}

function boxStats(box: [number, number, number, number]) {
  const [x, y, w, h] = box;
  const area = Math.max(1, w * h);
  return {
    x,
    y,
    w,
    h,
    area,
    right: x + w,
    bottom: y + h,
    center: getCenter(box),
    diagonal: Math.max(1, Math.hypot(w, h))
  };
}

function overlapStats(a: [number, number, number, number], b: [number, number, number, number]) {
  const first = boxStats(a);
  const second = boxStats(b);
  const xA = Math.max(first.x, second.x);
  const yA = Math.max(first.y, second.y);
  const xB = Math.min(first.right, second.right);
  const yB = Math.min(first.bottom, second.bottom);
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const union = first.area + second.area - interArea;

  return {
    iou: union > 0 ? interArea / union : 0,
    firstContainment: interArea / first.area,
    secondContainment: interArea / second.area,
    distance: Math.hypot(first.center.x - second.center.x, first.center.y - second.center.y),
    minDiagonal: Math.min(first.diagonal, second.diagonal),
    maxAreaRatio: Math.max(first.area / second.area, second.area / first.area)
  };
}

function looksLikeSamePerson(a: [number, number, number, number], b: [number, number, number, number]) {
  const stats = overlapStats(a, b);
  const strongOverlap = stats.iou > 0.32;
  const nestedDetection = stats.firstContainment > 0.65 || stats.secondContainment > 0.65;
  const almostSameCenter = stats.distance < stats.minDiagonal * 0.2 && stats.maxAreaRatio < 2.3;

  return strongOverlap || nestedDetection || almostSameCenter;
}

function mergePersonDetections(predictions: PersonDetection[]) {
  const merged: PersonDetection[] = [];
  const ordered = [...predictions].sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));

  ordered.forEach(prediction => {
    const existing = merged.find(target => looksLikeSamePerson(prediction.bbox, target.bbox));
    if (!existing) {
      merged.push({ ...prediction, bbox: [...prediction.bbox] });
      return;
    }

    const minX = Math.min(existing.bbox[0], prediction.bbox[0]);
    const minY = Math.min(existing.bbox[1], prediction.bbox[1]);
    const maxX = Math.max(existing.bbox[0] + existing.bbox[2], prediction.bbox[0] + prediction.bbox[2]);
    const maxY = Math.max(existing.bbox[1] + existing.bbox[3], prediction.bbox[1] + prediction.bbox[3]);
    existing.bbox = [minX, minY, maxX - minX, maxY - minY];
    existing.score = Math.max(existing.score, prediction.score);
    existing.source = existing.source === 'body' || prediction.source === 'body' ? 'body' : 'face';
  });

  return merged;
}

function getFaceConfidence(face: blazeface.NormalizedFace) {
  const probability = face.probability;
  if (Array.isArray(probability)) return probability[0] || 0;
  return typeof probability === 'number' ? probability : 0.99;
}

function faceToPersonDetection(
  face: blazeface.NormalizedFace,
  videoWidth: number,
  videoHeight: number
): PersonDetection | null {
  const confidence = getFaceConfidence(face);
  if (confidence < FACE_CONFIDENCE_THRESHOLD) return null;

  const topLeft = face.topLeft as [number, number];
  const bottomRight = face.bottomRight as [number, number];
  const faceX = topLeft[0];
  const faceY = topLeft[1];
  const faceW = bottomRight[0] - faceX;
  const faceH = bottomRight[1] - faceY;

  if (faceW < 10 || faceH < 10) return null;

  const padX = faceW * 0.75;
  const padTop = faceH * 0.45;
  const padBottom = faceH * 1.65;
  const x1 = clamp(faceX - padX, 0, videoWidth);
  const y1 = clamp(faceY - padTop, 0, videoHeight);
  const x2 = clamp(faceX + faceW + padX, 0, videoWidth);
  const y2 = clamp(faceY + faceH + padBottom, 0, videoHeight);

  if (x2 - x1 < 12 || y2 - y1 < 12) return null;

  return {
    bbox: [x1, y1, x2 - x1, y2 - y1],
    class: 'person',
    score: Math.max(confidence, 0.82),
    source: 'face'
  };
}

function hasFaceSupport(
  bodyBox: [number, number, number, number],
  faceDetections: PersonDetection[]
) {
  return faceDetections.some(face => {
    const faceCenter = getCenter(face.bbox);
    const stats = overlapStats(bodyBox, face.bbox);
    return isPointInsideBox(faceCenter, bodyBox) || stats.iou > 0.08 || stats.secondContainment > 0.45;
  });
}

function getDetectionMetrics(
  prediction: PersonDetection,
  videoWidth: number,
  videoHeight: number
) {
  const [x, y, width, height] = prediction.bbox;
  const frameArea = Math.max(1, videoWidth * videoHeight);
  const minFrameDimension = Math.max(1, Math.min(videoWidth, videoHeight));

  return {
    x,
    y,
    width,
    height,
    score: prediction.score || 0,
    minFrameDimension,
    areaRatio: (width * height) / frameArea,
    heightRatio: height / Math.max(1, videoHeight),
    widthRatio: width / Math.max(1, videoWidth),
    aspectRatio: width / Math.max(1, height),
    touchesFrameEdge: x <= 2 || y <= 2 || x + width >= videoWidth - 2 || y + height >= videoHeight - 2
  };
}

function isHumanLikeBodyDetection(
  prediction: PersonDetection,
  videoWidth: number,
  videoHeight: number,
  faceDetections: PersonDetection[]
) {
  const metrics = getDetectionMetrics(prediction, videoWidth, videoHeight);
  const {
    width,
    height,
    score,
    minFrameDimension,
    areaRatio,
    heightRatio,
    widthRatio,
    aspectRatio,
    touchesFrameEdge
  } = metrics;

  if (hasFaceSupport(prediction.bbox, faceDetections)) return true;
  if (width < minFrameDimension * 0.035 || height < minFrameDimension * 0.085) return false;
  if (aspectRatio > 1.05) return false;
  if (aspectRatio > 0.9 && heightRatio < 0.42) return false;
  if (widthRatio > 0.72 && heightRatio < 0.58) return false;

  const edgeFragment = touchesFrameEdge && areaRatio < 0.2 && heightRatio < 0.38 && aspectRatio > 0.7;
  if (edgeFragment) return false;

  const slenderBody = aspectRatio <= 0.72 && heightRatio >= 0.18 && areaRatio >= 0.012 && score >= 0.48;
  const upperBody = aspectRatio <= 0.9 && heightRatio >= 0.28 && areaRatio >= 0.035 && score >= 0.55;
  const closeBody = aspectRatio <= 0.96 && heightRatio >= 0.46 && areaRatio >= 0.09 && score >= 0.64;
  const strongPartialBody = aspectRatio <= 0.86 && heightRatio >= 0.24 && areaRatio >= 0.025 && score >= 0.82;

  return slenderBody || upperBody || closeBody || strongPartialBody;
}

function canStartNewPersonTrack(
  prediction: PersonDetection,
  videoWidth: number,
  videoHeight: number
) {
  if (prediction.source === 'face') return true;

  const {
    score,
    areaRatio,
    heightRatio,
    widthRatio,
    aspectRatio,
    touchesFrameEdge
  } = getDetectionMetrics(prediction, videoWidth, videoHeight);

  const tallBody = aspectRatio <= 0.72 && heightRatio >= 0.3 && areaRatio >= 0.025 && score >= 0.55;
  const clearTorso = aspectRatio <= 0.86 && heightRatio >= 0.42 && areaRatio >= 0.055 && score >= 0.62;
  const closeConfirmedBody = aspectRatio <= 0.94 && heightRatio >= 0.58 && areaRatio >= 0.14 && score >= 0.72;

  if (touchesFrameEdge && widthRatio > 0.55 && heightRatio < 0.55) return false;
  if (aspectRatio > 0.98) return false;

  return tallBody || clearTorso || closeConfirmedBody;
}

function canUpdateTrackWithDetection(
  prediction: PersonDetection,
  track: TrackedObject,
  videoWidth: number,
  videoHeight: number
) {
  if (prediction.source === 'face') return true;

  const metrics = getDetectionMetrics(prediction, videoWidth, videoHeight);
  const stats = overlapStats(prediction.bbox, track.bbox);
  const trackStats = boxStats(track.bbox);
  const trackAspect = track.bbox[2] / Math.max(1, track.bbox[3]);
  const areaRatioToTrack = metrics.areaRatio / Math.max(0.001, trackStats.area / Math.max(1, videoWidth * videoHeight));
  const centerMovedTooMuch = stats.distance > trackStats.diagonal * 0.65 && stats.iou < 0.06;
  const likelyArmOrHand = metrics.aspectRatio > 1.05
    || (metrics.touchesFrameEdge && metrics.widthRatio > 0.45 && metrics.heightRatio < 0.5)
    || (areaRatioToTrack > 3.5 && metrics.heightRatio < 0.58)
    || (metrics.aspectRatio > trackAspect * 1.9 && stats.iou < 0.12);

  if (likelyArmOrHand) return false;
  if (centerMovedTooMuch && metrics.score < 0.72) return false;

  return true;
}

function supportsExistingTrack(
  prediction: PersonDetection,
  trackBox: [number, number, number, number]
) {
  const stats = overlapStats(prediction.bbox, trackBox);
  const trackStats = boxStats(trackBox);
  const predictionCenter = getCenter(prediction.bbox);
  const nearTrackCenter = stats.distance < trackStats.diagonal * 0.55;
  const overlapsTrack = stats.iou > 0.04 || stats.firstContainment > 0.12 || stats.secondContainment > 0.12;

  return prediction.score > 0.38 && (overlapsTrack || nearTrackCenter || isPointInsideBox(predictionCenter, trackBox));
}

function isOcclusionSupportDetection(
  prediction: PersonDetection,
  currentTracked: Map<number, TrackedObject>,
  now: number
) {
  for (const track of currentTracked.values()) {
    if (track.class !== 'person') continue;
    if (now - track.lastSeen > VISIBLE_TRACK_HOLD_MS) continue;
    if (supportsExistingTrack(prediction, track.bbox)) return true;
  }

  return false;
}

function shouldSuppressNewTrack(
  prediction: PersonDetection,
  currentTracked: Map<number, TrackedObject>,
  predictedTracks: { id: number; bbox: [number, number, number, number] }[],
  now: number
) {
  const predictionStats = boxStats(prediction.bbox);

  for (const track of currentTracked.values()) {
    if (track.class !== 'person') continue;
    if (now - track.lastSeen > MAX_TIME_LOST_MS) continue;

    const predicted = predictedTracks.find(item => item.id === track.id);
    const referenceBox = predicted?.bbox || track.bbox;
    const stats = overlapStats(prediction.bbox, referenceBox);
    const referenceStats = boxStats(referenceBox);
    const closeCenters = stats.distance < Math.max(referenceStats.diagonal, predictionStats.diagonal) * 0.24;
    const strongDuplicateOverlap = stats.iou > 0.34;
    const nestedDuplicate = stats.firstContainment > 0.6 || stats.secondContainment > 0.6;
    const sameCenterDuplicate = closeCenters && stats.maxAreaRatio < 2.4;

    if (strongDuplicateOverlap || nestedDuplicate || sameCenterDuplicate) {
      return true;
    }
  }

  return false;
}

function drawZone(ctx: CanvasRenderingContext2D, zone: RestrictedZone, isDraft = false) {
  ctx.save();
  ctx.lineWidth = isDraft ? 2 : 2.5;
  ctx.strokeStyle = isDraft ? '#38bdf8' : '#f97316';
  ctx.fillStyle = isDraft ? 'rgba(56, 189, 248, 0.12)' : 'rgba(249, 115, 22, 0.16)';
  ctx.setLineDash(isDraft ? [7, 7] : []);
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
  ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
  ctx.setLineDash([]);

  const corner = Math.min(22, Math.max(12, Math.min(zone.width, zone.height) * 0.16));
  const x2 = zone.x + zone.width;
  const y2 = zone.y + zone.height;
  ctx.strokeStyle = isDraft ? '#bae6fd' : '#fed7aa';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(zone.x, zone.y + corner);
  ctx.lineTo(zone.x, zone.y);
  ctx.lineTo(zone.x + corner, zone.y);
  ctx.moveTo(x2 - corner, zone.y);
  ctx.lineTo(x2, zone.y);
  ctx.lineTo(x2, zone.y + corner);
  ctx.moveTo(zone.x, y2 - corner);
  ctx.lineTo(zone.x, y2);
  ctx.lineTo(zone.x + corner, y2);
  ctx.moveTo(x2 - corner, y2);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2, y2 - corner);
  ctx.stroke();

  const label = isDraft ? 'DESENHANDO ZONA' : 'ZONA RESTRITA';
  ctx.font = '800 12px Inter, sans-serif';
  const labelWidth = ctx.measureText(label).width + 20;
  const labelX = Math.max(0, Math.min(zone.x, ctx.canvas.width - labelWidth));
  const labelY = Math.max(0, zone.y - 30);
  ctx.fillStyle = isDraft ? 'rgba(8, 47, 73, 0.86)' : 'rgba(124, 45, 18, 0.88)';
  ctx.fillRect(labelX, labelY, labelWidth, 24);
  ctx.fillStyle = isDraft ? '#e0f2fe' : '#ffedd5';
  ctx.fillText(label, labelX + 10, labelY + 16);
  ctx.restore();
}

function drawTrack(ctx: CanvasRenderingContext2D, track: TrackedObject, isAlerting: boolean) {
  const [x, y, width, height] = track.bbox;
  const color = isAlerting ? '#ef4444' : '#22c55e';
  const label = `PESSOA #${track.id}`;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.fillStyle = isAlerting ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.10)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);

  ctx.font = '700 13px Inter, sans-serif';
  const labelWidth = ctx.measureText(label).width + 18;
  const labelY = Math.max(0, y - 28);
  ctx.fillStyle = color;
  ctx.fillRect(x, labelY, labelWidth, 24);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillText(label, x + 9, labelY + 16);
  ctx.restore();
}

function createStationaryState(point: { x: number; y: number }, now: number): StationaryState {
  return {
    anchor: [point.x, point.y],
    filteredPoint: [point.x, point.y],
    since: now,
    movingFrames: 0
  };
}

export function CameraTracker({
  isCameraOn,
  restrictedZone,
  isDrawingZone,
  loiteringSeconds,
  offHoursMode,
  onPeopleCountUpdate,
  onZoneChange,
  onAlert,
  onActiveRuleMessagesUpdate
}: CameraTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>();
  const trackedObjectsRef = useRef<Map<number, TrackedObject>>(new Map());
  const nextIdRef = useRef(1);
  const lastPeopleCountRef = useRef(-1);
  const callbacksRef = useRef({
    restrictedZone,
    loiteringSeconds,
    offHoursMode,
    onPeopleCountUpdate,
    onZoneChange,
    onAlert,
    onActiveRuleMessagesUpdate
  });
  const ruleStateRef = useRef<Map<string, boolean>>(new Map());
  const lastRuleEventRef = useRef<Map<string, number>>(new Map());
  const stationaryRef = useRef<Map<number, StationaryState>>(new Map());
  const draftZoneRef = useRef<RestrictedZone | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const motionAlertVisibleRef = useRef(false);
  const lastHumanSeenAtRef = useRef(0);
  const lastNonHumanMotionAtRef = useRef(0);

  const [model, setModel] = useState<DetectionModels | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isMotionAlertVisible, setIsMotionAlertVisible] = useState(false);

  useEffect(() => {
    callbacksRef.current = {
      restrictedZone,
      loiteringSeconds,
      offHoursMode,
      onPeopleCountUpdate,
      onZoneChange,
      onAlert,
      onActiveRuleMessagesUpdate
    };
  }, [
    restrictedZone,
    loiteringSeconds,
    offHoursMode,
    onPeopleCountUpdate,
    onZoneChange,
    onAlert,
    onActiveRuleMessagesUpdate
  ]);

  useEffect(() => {
    let mounted = true;

    const loadModel = async () => {
      await tf.ready();
      const [coco, face] = await Promise.all([
        cocoSsd.load({ base: 'mobilenet_v2' }),
        blazeface.load()
      ]);
      if (mounted) {
        setModel({ coco, face });
        motionDetectorRef.current = new MotionDetector();
      }
    };

    loadModel();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    ruleStateRef.current.clear();
    lastRuleEventRef.current.clear();
  }, [restrictedZone, offHoursMode]);

  useEffect(() => {
    const stopCamera = () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) videoRef.current.srcObject = null;
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      trackedObjectsRef.current.clear();
      stationaryRef.current.clear();
      ruleStateRef.current.clear();
      motionAlertVisibleRef.current = false;
      lastHumanSeenAtRef.current = 0;
      lastNonHumanMotionAtRef.current = 0;
      lastPeopleCountRef.current = -1;
      setIsReady(false);
      setIsMotionAlertVisible(false);
      callbacksRef.current.onPeopleCountUpdate(0);
      callbacksRef.current.onActiveRuleMessagesUpdate([]);
    };

    const startCamera = async () => {
      try {
        setCameraError('');
        motionDetectorRef.current = new MotionDetector();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setIsReady(true);
        }
      } catch {
        setCameraError('Não foi possível acessar a câmera');
        setIsReady(false);
      }
    };

    if (isCameraOn) {
      startCamera();
    } else {
      stopCamera();
    }

    return stopCamera;
  }, [isCameraOn]);

  useEffect(() => {
    if (!model || !isCameraOn || !isReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!video || !canvas || !ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    let isActive = true;
    let frameIndex = 0;
    let lastPredictions: PersonDetection[] = [];
    let lastOcclusionSupportPredictions: PersonDetection[] = [];

    const emitRuleEvent = (type: AlertType, trackId: number, now: number) => {
      const key = `${trackId}:${type}`;
      const wasActive = ruleStateRef.current.get(key) || false;
      const lastEventAt = lastRuleEventRef.current.get(key) || 0;
      ruleStateRef.current.set(key, true);

      if (!wasActive && now - lastEventAt > RULE_EVENT_COOLDOWN_MS) {
        lastRuleEventRef.current.set(key, now);
        callbacksRef.current.onAlert({
          type,
          message: ALERT_MESSAGES[type],
          trackId,
          timestamp: now
        });
      }
    };

    const clearInactiveRule = (type: AlertType, trackId: number) => {
      ruleStateRef.current.set(`${trackId}:${type}`, false);
    };

    const detectFrame = async () => {
      if (!isActive) return;

      if (!callbacksRef.current || !videoRef.current || video.readyState !== 4) {
        if (isActive) requestRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      const now = Date.now();
      const motionScore = motionDetectorRef.current?.detect(video) || 0;

      if (frameIndex % 2 === 0) {
        const [objectPredictions, facePredictions] = await Promise.all([
          model.coco.detect(video),
          model.face.estimateFaces(video, false)
        ]);
        if (!isActive) return;

        const facePersonPredictions = facePredictions
          .map(face => faceToPersonDetection(face, canvas.width, canvas.height))
          .filter((prediction): prediction is PersonDetection => Boolean(prediction));
        const rawPersonPredictions = objectPredictions
          .filter(prediction => prediction.class === 'person' && prediction.score > PERSON_CONFIDENCE_THRESHOLD)
          .map(prediction => ({
            ...prediction,
            bbox: prediction.bbox as [number, number, number, number],
            source: 'body' as const
          }));
        const personPredictions: PersonDetection[] = [];
        const occlusionSupportPredictions: PersonDetection[] = [];

        rawPersonPredictions.forEach(prediction => {
          if (isHumanLikeBodyDetection(prediction, canvas.width, canvas.height, facePersonPredictions)) {
            personPredictions.push(prediction);
            return;
          }

          if (isOcclusionSupportDetection(prediction, trackedObjectsRef.current, now)) {
            occlusionSupportPredictions.push(prediction);
          }
        });

        lastPredictions = mergePersonDetections([...personPredictions, ...facePersonPredictions]);
        lastOcclusionSupportPredictions = occlusionSupportPredictions;
      }
      frameIndex++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTracked = trackedObjectsRef.current;
      const newTracked = new Map<number, TrackedObject>();
      const trackIds = Array.from<number>(currentTracked.keys());
      const predictedTracks: { id: number; bbox: [number, number, number, number] }[] = trackIds.map(id => {
        const track = currentTracked.get(id)!;
        const isOccluded = now - track.lastSeen > 100;

        return {
          id,
          bbox: [
            track.filters[0].predict(isOccluded),
            track.filters[1].predict(isOccluded),
            track.filters[2].predict(isOccluded),
            track.filters[3].predict(isOccluded)
          ] as [number, number, number, number]
        };
      });

      const { matches, unassignedTracks, unassignedPredictions } = matchTracks(currentTracked, lastPredictions, predictedTracks);

      matches.forEach(({ trackId, predIdx }) => {
        const track = currentTracked.get(trackId)!;
        const pred = lastPredictions[predIdx];
        const canUseMeasurement = canUpdateTrackWithDetection(pred, track, canvas.width, canvas.height);
        if (!canUseMeasurement) {
          const predicted = predictedTracks.find(item => item.id === trackId);
          if (!predicted) return;
          const center = getCenter(predicted.bbox);
          const path = [...track.path, [center.x, center.y] as [number, number]];
          if (path.length > 40) path.shift();
          const trackMotionScore = motionDetectorRef.current?.getBoxMotionScore(predicted.bbox, canvas.width, canvas.height) || 0;
          const keepAlive = supportsExistingTrack(pred, predicted.bbox)
            || supportsExistingTrack(pred, track.bbox)
            || trackMotionScore > TRACK_MOTION_SUPPORT_THRESHOLD;
          const nextLostFrames = track.lostFrames + 1;
          if (!keepAlive && (nextLostFrames > MAX_LOST_FRAMES || now - track.lastSeen >= MAX_TIME_LOST_MS)) {
            stationaryRef.current.delete(trackId);
            ['restricted', 'loitering', 'offHours'].forEach(type => {
              ruleStateRef.current.delete(`${trackId}:${type}`);
            });
            return;
          }

          newTracked.set(trackId, {
            ...track,
            bbox: predicted.bbox,
            path,
            lastSeen: keepAlive ? now : track.lastSeen,
            lostFrames: keepAlive ? Math.min(nextLostFrames, 8) : nextLostFrames,
            score: keepAlive ? Math.max(track.score * 0.96, pred.score * 0.65) : track.score
          });
          return;
        }

        const [px, py, pw, ph] = pred.bbox;
        const bbox: [number, number, number, number] = [
          track.filters[0].update(px),
          track.filters[1].update(py),
          track.filters[2].update(pw),
          track.filters[3].update(ph)
        ];
        const center = getCenter(bbox);
        const path = [...track.path, [center.x, center.y] as [number, number]];
        if (path.length > 40) path.shift();

        newTracked.set(trackId, {
          ...track,
          bbox,
          path,
          lastSeen: now,
          hitStreak: track.hitStreak + 1,
          lostFrames: 0,
          score: pred.score,
          class: 'person'
        });
      });

      unassignedPredictions.forEach(predIdx => {
        const pred = lastPredictions[predIdx];
        if (!canStartNewPersonTrack(pred, canvas.width, canvas.height)) return;
        if (shouldSuppressNewTrack(pred, currentTracked, predictedTracks, now)) return;

        const [px, py, pw, ph] = pred.bbox;
        const center = getCenter(pred.bbox);
        const loiteringPoint = getLoiteringPoint(pred.bbox);
        const id = nextIdRef.current;
        nextIdRef.current += 1;

        newTracked.set(id, {
          id,
          bbox: [px, py, pw, ph],
          filters: [
            new KalmanFilter(px),
            new KalmanFilter(py),
            new KalmanFilter(pw),
            new KalmanFilter(ph)
          ],
          firstSeen: now,
          lastSeen: now,
          path: [[center.x, center.y]],
          crossed: false,
          hitStreak: 1,
          lostFrames: 0,
          score: pred.score,
          class: 'person'
        });

        stationaryRef.current.set(id, createStationaryState(loiteringPoint, now));
      });

      unassignedTracks.forEach(trackId => {
        const track = currentTracked.get(trackId)!;
        const lostFrames = track.lostFrames + 1;

        if (lostFrames <= MAX_LOST_FRAMES && now - track.lastSeen < MAX_TIME_LOST_MS) {
          const predicted = predictedTracks.find(item => item.id === trackId);
          if (!predicted) return;
          const center = getCenter(predicted.bbox);
          const path = [...track.path, [center.x, center.y] as [number, number]];
          if (path.length > 40) path.shift();
          const occlusionSupport = lastOcclusionSupportPredictions.find(prediction => (
            supportsExistingTrack(prediction, predicted.bbox) || supportsExistingTrack(prediction, track.bbox)
          ));
          const trackMotionScore = motionDetectorRef.current?.getBoxMotionScore(predicted.bbox, canvas.width, canvas.height) || 0;
          const motionSupport = track.hitStreak >= MIN_HITS_TO_DISPLAY
            && track.lostFrames < MAX_LOST_FRAMES
            && trackMotionScore > TRACK_MOTION_SUPPORT_THRESHOLD;
          const hasOcclusionSupport = Boolean(occlusionSupport) || motionSupport;

          newTracked.set(trackId, {
            ...track,
            bbox: predicted.bbox,
            path,
            lastSeen: hasOcclusionSupport ? now : track.lastSeen,
            lostFrames: hasOcclusionSupport ? Math.min(lostFrames, 8) : lostFrames,
            score: occlusionSupport ? Math.max(track.score * 0.96, occlusionSupport.score * 0.7) : track.score
          });
        } else {
          stationaryRef.current.delete(trackId);
          ['restricted', 'loitering', 'offHours'].forEach(type => {
            ruleStateRef.current.delete(`${trackId}:${type}`);
          });
        }
      });

      trackedObjectsRef.current = newTracked;

      const visibleTracks = Array.from(newTracked.values()).filter(track => (
        track.class === 'person'
        && track.hitStreak >= MIN_HITS_TO_DISPLAY
        && now - track.lastSeen < VISIBLE_TRACK_HOLD_MS
      ));
      if (visibleTracks.length > 0) {
        lastHumanSeenAtRef.current = now;
      }

      const canShowMotionAlert = visibleTracks.length === 0 && now - lastHumanSeenAtRef.current > HUMAN_MOTION_SUPPRESSION_MS;
      const hasNonHumanMotion = motionScore > MOTION_ALERT_ON_THRESHOLD
        || (motionAlertVisibleRef.current && motionScore > MOTION_ALERT_OFF_THRESHOLD);

      if (canShowMotionAlert && hasNonHumanMotion) {
        lastNonHumanMotionAtRef.current = now;
      }

      const recentlyHadNonHumanMotion = now - lastNonHumanMotionAtRef.current < MOTION_ALERT_HOLD_MS;
      const shouldShowMotionAlert = canShowMotionAlert
        && recentlyHadNonHumanMotion
        && (motionAlertVisibleRef.current || motionScore > MOTION_ALERT_ON_THRESHOLD);

      if (shouldShowMotionAlert !== motionAlertVisibleRef.current) {
        motionAlertVisibleRef.current = shouldShowMotionAlert;
        setIsMotionAlertVisible(shouldShowMotionAlert);
      }

      const visibleTrackIds = new Set(visibleTracks.map(track => track.id));

      newTracked.forEach(track => {
        if (visibleTrackIds.has(track.id)) return;
        clearInactiveRule('restricted', track.id);
        clearInactiveRule('loitering', track.id);
        clearInactiveRule('offHours', track.id);
      });

      if (visibleTracks.length !== lastPeopleCountRef.current) {
        lastPeopleCountRef.current = visibleTracks.length;
        callbacksRef.current.onPeopleCountUpdate(visibleTracks.length);
      }

      const activeMessages = new Set<string>();
      const alertingTracks = new Set<number>();
      const zone = callbacksRef.current.restrictedZone;

      visibleTracks.forEach(track => {
        const center = getCenter(track.bbox);
        const bottomCenter = getBottomCenter(track.bbox);
        const loiteringPoint = getLoiteringPoint(track.bbox);
        const diagonal = Math.hypot(track.bbox[2], track.bbox[3]);
        const stationary = stationaryRef.current.get(track.id) || createStationaryState(loiteringPoint, now);
        const filteredPoint: [number, number] = [
          stationary.filteredPoint[0] * (1 - STILL_FILTER_ALPHA) + loiteringPoint.x * STILL_FILTER_ALPHA,
          stationary.filteredPoint[1] * (1 - STILL_FILTER_ALPHA) + loiteringPoint.y * STILL_FILTER_ALPHA
        ];
        const movement = Math.hypot(filteredPoint[0] - stationary.anchor[0], filteredPoint[1] - stationary.anchor[1]);
        const stillThreshold = Math.max(STILL_MIN_PX, diagonal * 0.085);
        const strongMovementThreshold = stillThreshold * STRONG_MOVEMENT_MULTIPLIER;
        const movingFrames = movement > stillThreshold
          ? stationary.movingFrames + 1
          : Math.max(0, stationary.movingFrames - 1);
        const movedEnoughToReset = movement > strongMovementThreshold || movingFrames >= MOVING_FRAMES_TO_RESET;

        if (movedEnoughToReset) {
          stationaryRef.current.set(track.id, createStationaryState({ x: filteredPoint[0], y: filteredPoint[1] }, now));
          clearInactiveRule('loitering', track.id);
        } else {
          stationaryRef.current.set(track.id, {
            ...stationary,
            filteredPoint,
            movingFrames
          });

          if (now - stationary.since >= callbacksRef.current.loiteringSeconds * 1000) {
            emitRuleEvent('loitering', track.id, now);
            activeMessages.add(ALERT_MESSAGES.loitering);
            alertingTracks.add(track.id);
          }
        }

        if (zone && (isPointInsideZone(center, zone) || isPointInsideZone(bottomCenter, zone))) {
          emitRuleEvent('restricted', track.id, now);
          activeMessages.add(ALERT_MESSAGES.restricted);
          alertingTracks.add(track.id);
        } else {
          clearInactiveRule('restricted', track.id);
        }

        if (callbacksRef.current.offHoursMode) {
          emitRuleEvent('offHours', track.id, now);
          activeMessages.add(ALERT_MESSAGES.offHours);
          alertingTracks.add(track.id);
        } else {
          clearInactiveRule('offHours', track.id);
        }
      });

      if (zone) drawZone(ctx, zone);
      if (draftZoneRef.current) drawZone(ctx, normalizeZone(draftZoneRef.current), true);
      visibleTracks.forEach(track => drawTrack(ctx, track, alertingTracks.has(track.id)));

      callbacksRef.current.onActiveRuleMessagesUpdate(Array.from(activeMessages));
      if (isActive) requestRef.current = requestAnimationFrame(detectFrame);
    };

    detectFrame();

    return () => {
      isActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    };
  }, [model, isCameraOn, isReady]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = point;
    draftZoneRef.current = {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone || !dragStartRef.current) return;
    const point = getCanvasPoint(event);
    if (!point) return;

    draftZoneRef.current = {
      x: dragStartRef.current.x,
      y: dragStartRef.current.y,
      width: point.x - dragStartRef.current.x,
      height: point.y - dragStartRef.current.y
    };
  };

  const finishDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone || !draftZoneRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);

    const zone = normalizeZone(draftZoneRef.current);
    draftZoneRef.current = null;
    dragStartRef.current = null;

    if (zone.width > 20 && zone.height > 20) {
      callbacksRef.current.onZoneChange(zone);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      {!isCameraOn && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-500">
          <VideoOff className="h-8 w-8" />
          <p className="text-sm font-medium">Câmera desligada</p>
        </div>
      )}

      {isCameraOn && !model && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
          <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
          <p className="text-sm font-medium">Carregando detector</p>
        </div>
      )}

      {isCameraOn && model && !isReady && !cameraError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-400">
          <Camera className="h-7 w-7 text-sky-400" />
          <p className="text-sm font-medium">Conectando câmera</p>
        </div>
      )}

      {cameraError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950 px-6 text-center text-sm text-rose-300">
          {cameraError}
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        className={`absolute inset-0 h-full w-full object-cover ${isDrawingZone ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
      />

      {isCameraOn && isReady && isMotionAlertVisible && (
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-md border border-sky-300/50 bg-sky-950/75 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.25)] backdrop-blur">
          <Activity className="h-4 w-4 text-sky-300" />
          Movimento
        </div>
      )}
    </div>
  );
}
