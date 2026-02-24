import { MessageType } from '../messaging/messages';

const keyValue = document.getElementById('key-value')!;
const keyRelative = document.getElementById('key-relative')!;
const bpmValue = document.getElementById('bpm-value')!;
const bpmStatus = document.getElementById('bpm-status')!;
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const formatBtns = document.querySelectorAll('.format-btn');
const statusEl = document.getElementById('status')!;
const container = document.querySelector('.container')!;

let isListening = false;
let selectedFormat: 'mp3' | 'wav' = 'mp3';

// On popup open, check if already analyzing
chrome.runtime.sendMessage(
  { type: MessageType.GET_STATE },
  (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.isAnalyzing) {
      isListening = true;
      toggleBtn.textContent = 'Stop Listening';
      toggleBtn.classList.add('active');
      container.classList.add('analyzing');
      statusEl.textContent = 'Analyzing...';
    }
  },
);

// Format toggle
formatBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    formatBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFormat = (btn as HTMLElement).dataset.format as 'mp3' | 'wav';
  });
});

// Start / Stop listening
toggleBtn.addEventListener('click', async () => {
  if (isListening) {
    chrome.runtime.sendMessage({ type: MessageType.STOP_CAPTURE });
    setInactive();
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showError('No active tab found');
      return;
    }

    statusEl.textContent = 'Starting...';
    statusEl.classList.remove('error');

    chrome.runtime.sendMessage(
      { type: MessageType.START_CAPTURE, tabId: tab.id },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          showError(response?.error || 'Failed to start capture');
          return;
        }
        setActive();
      },
    );
  }
});

// Download button
downloadBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.url) {
    showError('No active tab found');
    return;
  }

  downloadBtn.disabled = true;
  statusEl.classList.remove('error', 'success');
  statusEl.textContent = 'Requesting download...';

  chrome.runtime.sendMessage({
    type: MessageType.START_DOWNLOAD,
    tabUrl: tab.url,
    format: selectedFormat,
  });
});

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message) => {
  // Analysis results
  if (message.type === MessageType.ANALYSIS_RESULT && message.target === 'popup') {
    const data = message.data;

    if (data.error) {
      showError(data.error);
      if (data.error === 'Tab audio ended') {
        setInactive();
      }
      return;
    }

    if (data.key !== undefined) {
      keyValue.textContent = `${data.key} ${data.scale}`;
      keyRelative.textContent = `${data.relativeKey} ${data.relativeScale}`;
    }

    if (data.bpm !== undefined) {
      bpmValue.textContent = `${Math.round(data.bpm)}`;
      bpmStatus.textContent =
        data.bpmConfidence >= 1.0 ? 'locked' : 'detecting...';
    }
  }

  // Download status
  if (message.type === MessageType.DOWNLOAD_STATUS && message.target === 'popup') {
    const { status, error } = message.data;

    switch (status) {
      case 'starting':
        statusEl.textContent = 'Requesting download...';
        statusEl.classList.remove('error', 'success');
        break;
      case 'downloading':
        statusEl.textContent = 'Downloading...';
        break;
      case 'complete':
        statusEl.textContent = 'Download complete!';
        statusEl.classList.add('success');
        downloadBtn.disabled = false;
        break;
      case 'error':
        showError(error || 'Download failed');
        downloadBtn.disabled = false;
        break;
    }
  }
});

function setActive(): void {
  isListening = true;
  toggleBtn.textContent = 'Stop Listening';
  toggleBtn.classList.add('active');
  container.classList.add('analyzing');
  statusEl.textContent = 'Analyzing...';
  statusEl.classList.remove('error', 'success');
}

function setInactive(): void {
  isListening = false;
  toggleBtn.textContent = 'Start Listening';
  toggleBtn.classList.remove('active');
  container.classList.remove('analyzing');
  statusEl.textContent = '';
  keyValue.textContent = '--';
  keyRelative.textContent = '';
  bpmValue.textContent = '--';
  bpmStatus.textContent = '';
}

function showError(msg: string): void {
  statusEl.textContent = msg;
  statusEl.classList.remove('success');
  statusEl.classList.add('error');
}
