import { MessageType } from '../messaging/messages';
import type { Message } from '../messaging/messages';
import { KeyDetector } from '../analysis/key-detector';
import type { KeyResult } from '../analysis/key-detector';
import { BpmDetector } from '../analysis/bpm-detector';
import type { BpmResult } from '../analysis/bpm-detector';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let keyDetector: KeyDetector | null = null;
let bpmDetector: BpmDetector | null = null;

chrome.runtime.onMessage.addListener((message: Message) => {
  if (!('target' in message) || message.target !== 'offscreen') return;

  if (message.type === MessageType.START_ANALYSIS) {
    startAnalysis(message.streamId);
  }

  if (message.type === MessageType.STOP_ANALYSIS) {
    stopAnalysis();
  }
});

async function startAnalysis(streamId: string): Promise<void> {
  // Clean up any previous session
  stopAnalysis();

  try {
    // Redeem stream ID for actual MediaStream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as unknown as MediaTrackConstraints,
      video: false,
    });

    // Create AudioContext
    audioContext = new AudioContext({ sampleRate: 44100 });
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(mediaStream);

    // Connect to destination so tab audio keeps playing
    source.connect(audioContext.destination);

    // Listen for track ending (tab closed/navigated)
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.addEventListener('ended', () => {
        stopAnalysis();
        chrome.runtime.sendMessage({
          type: MessageType.ANALYSIS_RESULT,
          target: 'popup',
          data: { error: 'Tab audio ended' },
        });
      });
    }

    // Initialize and start key detection
    keyDetector = new KeyDetector(audioContext, source, onKeyDetected);
    keyDetector.start();

    // Initialize and start BPM detection
    bpmDetector = new BpmDetector(audioContext, source, onBpmDetected);
    try {
      await bpmDetector.start();
    } catch (err) {
      console.warn('BPM detection failed to start:', err);
      chrome.runtime.sendMessage({
        type: MessageType.ANALYSIS_RESULT,
        target: 'popup',
        data: { error: 'BPM detection unavailable' },
      });
    }
  } catch (err) {
    console.error('Failed to start analysis:', err);
    chrome.runtime.sendMessage({
      type: MessageType.ANALYSIS_RESULT,
      target: 'popup',
      data: { error: String(err) },
    });
  }
}

function onKeyDetected(result: KeyResult): void {
  chrome.runtime.sendMessage({
    type: MessageType.ANALYSIS_RESULT,
    target: 'popup',
    data: {
      key: result.key,
      scale: result.scale,
      relativeKey: result.relativeKey,
      relativeScale: result.relativeScale,
      confidence: result.confidence,
    },
  });
}

function onBpmDetected(result: BpmResult): void {
  chrome.runtime.sendMessage({
    type: MessageType.ANALYSIS_RESULT,
    target: 'popup',
    data: {
      bpm: result.bpm,
      bpmConfidence: result.confidence,
    },
  });
}

function stopAnalysis(): void {
  keyDetector?.stop();
  keyDetector = null;

  bpmDetector?.stop();
  bpmDetector = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
