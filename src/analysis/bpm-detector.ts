// @ts-expect-error — webpack alias resolves this to the correct dist path
import { BpmAnalyzer, getBiquadFilter } from 'realtime-bpm-analyzer';

export interface BpmResult {
  bpm: number;
  confidence: number;
}

type BpmCallback = (result: BpmResult) => void;

interface BpmCandidate {
  tempo: number;
  count: number;
  confidence: number;
}

interface BpmData {
  bpm: readonly BpmCandidate[];
  threshold: number;
}

interface BpmAnalyzerInstance {
  node: AudioWorkletNode;
  on(event: string, listener: (data: BpmData) => void): void;
  stop(): void;
  disconnect(): void;
}

const PROCESSOR_NAME = 'realtime-bpm-processor';

export class BpmDetector {
  private bpmAnalyzer: BpmAnalyzerInstance | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private callback: BpmCallback;

  constructor(
    private audioContext: AudioContext,
    private sourceNode: AudioNode,
    callback: BpmCallback,
  ) {
    this.callback = callback;
  }

  async start(): Promise<void> {
    // Low-pass filter isolates bass for better beat detection
    this.filterNode = getBiquadFilter(this.audioContext) as BiquadFilterNode;

    // Register the AudioWorklet processor from the extension's static file
    // (bypasses the library's Blob URL approach which Chrome CSP blocks)
    const processorUrl = chrome.runtime.getURL('realtime-bpm-processor.js');
    await this.audioContext.audioWorklet.addModule(processorUrl);

    // Create the worklet node manually
    const workletNode = new AudioWorkletNode(
      this.audioContext,
      PROCESSOR_NAME,
      {
        processorOptions: {
          continuousAnalysis: true,
          stabilizationTime: 20_000,
        },
      },
    );

    // Wrap in BpmAnalyzer for the typed event API
    this.bpmAnalyzer = new BpmAnalyzer(workletNode) as BpmAnalyzerInstance;

    // Audio graph: source → lowpass → BPM analyzer
    this.sourceNode.connect(this.filterNode);
    this.filterNode.connect(this.bpmAnalyzer.node);

    // Listen for BPM events
    this.bpmAnalyzer.on('bpm', (data: BpmData) => {
      if (data.bpm.length > 0) {
        const top = data.bpm[0];
        this.callback({ bpm: top.tempo, confidence: top.confidence });
      }
    });

    this.bpmAnalyzer.on('bpmStable', (data: BpmData) => {
      if (data.bpm.length > 0) {
        const top = data.bpm[0];
        this.callback({ bpm: top.tempo, confidence: 1.0 });
      }
    });

    await this.audioContext.resume();
  }

  stop(): void {
    if (this.filterNode) {
      try { this.sourceNode.disconnect(this.filterNode); } catch { /* already disconnected */ }
      this.filterNode = null;
    }
    if (this.bpmAnalyzer) {
      this.bpmAnalyzer.stop();
      this.bpmAnalyzer.disconnect();
      this.bpmAnalyzer = null;
    }
  }
}
