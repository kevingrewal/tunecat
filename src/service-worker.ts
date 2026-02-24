import { MessageType } from './messaging/messages';
import type { Message } from './messaging/messages';

let isAnalyzing = false;
let activeTabId: number | null = null;

// Community Cobalt instances (no auth required), ordered by reliability
const COBALT_INSTANCES = [
  'https://cobaltapi.squair.xyz/',
  'https://api.qwkuns.me/',
  'https://api.dl.woof.monster/',
  'https://api.cobalt.liubquanti.click/',
  'https://api.kektube.com/',
  'https://cobaltapi.cjs.nz/',
];

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === MessageType.START_CAPTURE) {
      handleStartCapture(message.tabId).then(
        () => sendResponse({ ok: true }),
        (err) => sendResponse({ ok: false, error: String(err) }),
      );
      return true; // keep channel open for async response
    }

    if (message.type === MessageType.STOP_CAPTURE) {
      handleStopCapture();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === MessageType.GET_STATE) {
      sendResponse({ isAnalyzing, activeTabId });
      return;
    }

    if (message.type === MessageType.START_DOWNLOAD) {
      handleDownload(message.tabUrl, message.format);
      sendResponse({ ok: true });
      return;
    }
  },
);

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Capture tab audio for musical key and BPM analysis',
    });
  }
}

async function handleStartCapture(tabId: number): Promise<void> {
  // If already analyzing, stop first
  if (isAnalyzing) {
    handleStopCapture();
  }

  await ensureOffscreenDocument();

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });

  chrome.runtime.sendMessage({
    type: MessageType.START_ANALYSIS,
    target: 'offscreen',
    streamId,
  });

  isAnalyzing = true;
  activeTabId = tabId;
}

function handleStopCapture(): void {
  chrome.runtime.sendMessage({
    type: MessageType.STOP_ANALYSIS,
    target: 'offscreen',
  });

  isAnalyzing = false;
  activeTabId = null;
}

function sendDownloadStatus(
  status: 'starting' | 'downloading' | 'complete' | 'error',
  error?: string,
): void {
  chrome.runtime.sendMessage({
    type: MessageType.DOWNLOAD_STATUS,
    target: 'popup',
    data: { status, error },
  });
}

async function tryInstance(
  instanceUrl: string,
  tabUrl: string,
  format: 'mp3' | 'wav',
): Promise<{ downloadUrl: string; filename?: string }> {
  const response = await fetch(instanceUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: tabUrl,
      downloadMode: 'audio',
      audioFormat: format,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.status === 'error') {
    const code = data.error?.code || data.error || `HTTP ${response.status}`;
    throw new Error(String(code));
  }

  let downloadUrl: string | undefined;

  if (data.status === 'tunnel' || data.status === 'redirect') {
    downloadUrl = data.url;
  } else if (data.status === 'local-processing' && data.tunnel?.length) {
    downloadUrl = data.tunnel[0];
  }

  if (!downloadUrl) {
    throw new Error('No download URL in response');
  }

  return { downloadUrl, filename: data.filename };
}

async function handleDownload(
  tabUrl: string,
  format: 'mp3' | 'wav',
): Promise<void> {
  sendDownloadStatus('starting');

  let lastError = '';

  for (const instance of COBALT_INSTANCES) {
    try {
      const { downloadUrl, filename } = await tryInstance(
        instance,
        tabUrl,
        format,
      );

      sendDownloadStatus('downloading');

      chrome.downloads.download(
        {
          url: downloadUrl,
          ...(filename ? { filename } : {}),
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            sendDownloadStatus(
              'error',
              chrome.runtime.lastError?.message || 'Download failed',
            );
          } else {
            sendDownloadStatus('complete');
          }
        },
      );
      return; // success — stop trying other instances
    } catch (err) {
      lastError = String(err);
      console.warn(`Cobalt instance ${instance} failed:`, err);
      // try next instance
    }
  }

  // All instances failed
  sendDownloadStatus('error', lastError || 'All download servers unavailable');
}
