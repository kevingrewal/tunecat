import Meyda from 'meyda';

// Krumhansl-Kessler key profiles (empirical pitch class weights)
// Index 0 = tonic, values represent how strongly each scale degree
// correlates with that key
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Relative major/minor offsets (minor is 3 semitones below its relative major)
const RELATIVE_MAJOR_OFFSET = 3;

export interface KeyResult {
  key: string;
  scale: 'major' | 'minor';
  relativeKey: string;
  relativeScale: 'major' | 'minor';
  confidence: number;
  isStable: boolean;
}

type KeyCallback = (result: KeyResult) => void;

export class KeyDetector {
  private static readonly STABILITY_THRESHOLD = 5;
  private static readonly STABILITY_CONFIDENCE = 0.7;
  private static readonly WARMUP_DETECTIONS = 4; // 8 seconds (4 × 2s intervals)

  private analyzer: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;
  private chromaAccumulator: number[] = new Array(12).fill(0);
  private frameCount = 0;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private callback: KeyCallback;
  private lastDetectedKey: string | null = null;
  private lastDetectedScale: 'major' | 'minor' | null = null;
  private consecutiveCount = 0;
  private detectionCount = 0;
  private _isStable = false;

  constructor(
    private audioContext: AudioContext,
    private sourceNode: AudioNode,
    callback: KeyCallback,
  ) {
    this.callback = callback;
  }

  start(): void {
    this.analyzer = Meyda.createMeydaAnalyzer({
      audioContext: this.audioContext,
      source: this.sourceNode,
      bufferSize: 2048,
      featureExtractors: ['chroma'],
      callback: (features: { chroma?: number[] }) => {
        if (features.chroma) {
          this.accumulateChroma(features.chroma);
        }
      },
    });
    this.analyzer.start();

    // Run key detection every 2 seconds until stable
    this.analysisInterval = setInterval(() => {
      if (this.frameCount > 0 && !this._isStable) {
        this.detectKey();
      }
    }, 2000);
  }

  private accumulateChroma(chroma: number[]): void {
    for (let i = 0; i < 12; i++) {
      this.chromaAccumulator[i] += chroma[i];
    }
    this.frameCount++;
  }

  private detectKey(): void {
    // Normalize accumulated chroma
    const normalized = this.chromaAccumulator.map(v => v / this.frameCount);

    let bestKey = 0;
    let bestScale: 'major' | 'minor' = 'major';
    let bestCorrelation = -Infinity;

    for (let shift = 0; shift < 12; shift++) {
      const rotated = this.rotateArray(normalized, shift);

      const majorCorr = this.pearsonCorrelation(rotated, MAJOR_PROFILE);
      const minorCorr = this.pearsonCorrelation(rotated, MINOR_PROFILE);

      if (majorCorr > bestCorrelation) {
        bestCorrelation = majorCorr;
        bestKey = shift;
        bestScale = 'major';
      }
      if (minorCorr > bestCorrelation) {
        bestCorrelation = minorCorr;
        bestKey = shift;
        bestScale = 'minor';
      }
    }

    // Map correlation from [-1, 1] to [0, 1]
    const confidence = (bestCorrelation + 1) / 2;

    // Only emit if confidence is meaningful
    if (confidence < 0.3) return;

    // Compute relative key
    let relativeKey: string;
    let relativeScale: 'major' | 'minor';
    if (bestScale === 'minor') {
      relativeKey = NOTE_NAMES[(bestKey + RELATIVE_MAJOR_OFFSET) % 12];
      relativeScale = 'major';
    } else {
      relativeKey = NOTE_NAMES[(bestKey + 12 - RELATIVE_MAJOR_OFFSET) % 12];
      relativeScale = 'minor';
    }

    // Decay accumulator for gradual adaptation (0.85 = heavier accumulation
    // for stable readings since beats are consistent)
    for (let i = 0; i < 12; i++) {
      this.chromaAccumulator[i] *= 0.85;
    }
    this.frameCount = Math.floor(this.frameCount * 0.85);

    // Track consecutive same-key detections for stability
    const keyName = NOTE_NAMES[bestKey];
    this.detectionCount++;

    if (
      keyName === this.lastDetectedKey &&
      bestScale === this.lastDetectedScale &&
      confidence >= KeyDetector.STABILITY_CONFIDENCE
    ) {
      this.consecutiveCount++;
    } else {
      this.lastDetectedKey = keyName;
      this.lastDetectedScale = bestScale;
      this.consecutiveCount = 1;
    }

    // Only declare stable after warm-up period gives the algorithm enough
    // chroma data to produce reliable correlations
    if (
      this.detectionCount >= KeyDetector.WARMUP_DETECTIONS &&
      this.consecutiveCount >= KeyDetector.STABILITY_THRESHOLD
    ) {
      this._isStable = true;
    }

    this.callback({
      key: keyName,
      scale: bestScale,
      relativeKey,
      relativeScale,
      confidence,
      isStable: this._isStable,
    });
  }

  private rotateArray(arr: number[], shift: number): number[] {
    return [...arr.slice(shift), ...arr.slice(0, shift)];
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : numerator / denom;
  }

  stop(): void {
    this.analyzer?.stop();
    if (this.analysisInterval !== null) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.chromaAccumulator = new Array(12).fill(0);
    this.frameCount = 0;
    this.lastDetectedKey = null;
    this.lastDetectedScale = null;
    this.consecutiveCount = 0;
    this.detectionCount = 0;
    this._isStable = false;
  }
}
