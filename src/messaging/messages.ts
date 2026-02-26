export enum MessageType {
  // Popup → Service Worker
  START_CAPTURE = 'START_CAPTURE',
  STOP_CAPTURE = 'STOP_CAPTURE',
  GET_STATE = 'GET_STATE',
  START_DOWNLOAD = 'START_DOWNLOAD',

  // Service Worker → Offscreen
  START_ANALYSIS = 'START_ANALYSIS',
  STOP_ANALYSIS = 'STOP_ANALYSIS',

  // Offscreen → Popup (broadcast)
  ANALYSIS_RESULT = 'ANALYSIS_RESULT',
  ANALYSIS_COMPLETE = 'ANALYSIS_COMPLETE',

  // Service Worker → Popup
  DOWNLOAD_STATUS = 'DOWNLOAD_STATUS',
}

export interface StartCaptureMessage {
  type: MessageType.START_CAPTURE;
  tabId: number;
}

export interface StopCaptureMessage {
  type: MessageType.STOP_CAPTURE;
}

export interface GetStateMessage {
  type: MessageType.GET_STATE;
}

export interface StartDownloadMessage {
  type: MessageType.START_DOWNLOAD;
  tabUrl: string;
  format: 'mp3' | 'wav';
}

export interface StartAnalysisMessage {
  type: MessageType.START_ANALYSIS;
  target: 'offscreen';
  streamId: string;
}

export interface StopAnalysisMessage {
  type: MessageType.STOP_ANALYSIS;
  target: 'offscreen';
}

export interface AnalysisResultMessage {
  type: MessageType.ANALYSIS_RESULT;
  target: 'popup';
  data: {
    key?: string;
    scale?: string;
    relativeKey?: string;
    relativeScale?: string;
    confidence?: number;
    keyStable?: boolean;
    bpm?: number;
    bpmConfidence?: number;
    error?: string;
  };
}

export interface AnalysisCompleteMessage {
  type: MessageType.ANALYSIS_COMPLETE;
  target: 'popup';
}

export interface DownloadStatusMessage {
  type: MessageType.DOWNLOAD_STATUS;
  target: 'popup';
  data: {
    status: 'starting' | 'downloading' | 'complete' | 'error';
    error?: string;
  };
}

export type Message =
  | StartCaptureMessage
  | StopCaptureMessage
  | GetStateMessage
  | StartDownloadMessage
  | StartAnalysisMessage
  | StopAnalysisMessage
  | AnalysisResultMessage
  | AnalysisCompleteMessage
  | DownloadStatusMessage;
