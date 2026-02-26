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

    // Auto-stop: offscreen reached consensus on key + BPM
    if (message.type === MessageType.ANALYSIS_COMPLETE) {
      isAnalyzing = false;
      activeTabId = null;
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

const DOWNLOAD_TIMEOUT = 120_000; // 2 minutes

function awaitDownload(
  url: string,
  filename?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, ...(filename ? { filename } : {}) },
      (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          reject(
            new Error(
              chrome.runtime.lastError?.message || 'Download failed to start',
            ),
          );
          return;
        }

        const timeout = setTimeout(() => {
          chrome.downloads.onChanged.removeListener(listener);
          chrome.downloads.cancel(downloadId, () => {
            reject(new Error('Download timed out'));
          });
        }, DOWNLOAD_TIMEOUT);

        const listener = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id !== downloadId) return;

          if (delta.state?.current === 'complete') {
            clearTimeout(timeout);
            chrome.downloads.onChanged.removeListener(listener);

            // Verify the file actually has content
            chrome.downloads.search({ id: downloadId }, (results) => {
              const item = results[0];
              if (item && item.bytesReceived > 0) {
                resolve();
              } else {
                // Clean up the empty file, then reject so next instance is tried
                chrome.downloads.removeFile(downloadId, () => {
                  reject(new Error('Download produced empty file'));
                });
              }
            });
          } else if (delta.state?.current === 'interrupted') {
            clearTimeout(timeout);
            chrome.downloads.onChanged.removeListener(listener);
            reject(
              new Error(
                (delta.error as { current?: string })?.current ||
                  'Download interrupted',
              ),
            );
          }
        };

        chrome.downloads.onChanged.addListener(listener);
      },
    );
  });
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

      await awaitDownload(downloadUrl, filename);
      sendDownloadStatus('complete');
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
