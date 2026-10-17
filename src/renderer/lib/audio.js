// Small audio utilities shared by the capture hook.

// Convert a Blob (MediaRecorder output) to base64 for IPC transport.
export async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000; // slice to avoid call-stack limits on long buffers
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// List audio input devices. Labels appear only after permission is granted.
export async function listAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}

// Compute RMS level (0..1) from an AnalyserNode - drives the level meter.
export function readRmsLevel(analyser, timeData) {
  analyser.getFloatTimeDomainData(timeData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
  return Math.sqrt(sum / timeData.length);
}
