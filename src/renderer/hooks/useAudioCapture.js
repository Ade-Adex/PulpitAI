// useAudioCapture: grabs a microphone, system audio (loopback), or both;
// mixes them into one stream, runs VAD, and calls onUtterance(blob) with a
// MediaRecorder clip for each spoken phrase.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createUtteranceDetector } from '../lib/vad.js';
import { listAudioDevices, readRmsLevel } from '../lib/audio.js';

const POLL_MS = 60;
const RECORDER_MIME = 'audio/webm;codecs=opus';

export function useAudioCapture({ source, deviceId, vad, onUtterance }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'starting' | 'listening' | 'error'
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);

  const ctxRef = useRef(null); // analyser context (closed on stop)
  const mixCtxRef = useRef(null); // mic+system mixer context (closed on stop)
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const pendingClipRef = useRef([]);
  const cleanupRef = useRef(null); // full teardown, set during start()
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listAudioDevices());
    } catch {
      setDevices([]);
    }
  }, []);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setStatus('idle');
    setLevel(0);
  }, []);

  // Grab the requested audio sources and mix them into a single stream.
  const acquireStream = useCallback(async (sourceKind, micDeviceId) => {
    const wantMic = sourceKind === 'mic' || sourceKind === 'both';
    const wantSystem = sourceKind === 'system' || sourceKind === 'both';
    const micConstraints = micDeviceId
      ? { audio: { deviceId: { exact: micDeviceId } } }
      : { audio: true };

    if (wantSystem) {
      // Electron's display-media handler grants loopback (system) audio.
      // Browsers require video:true, so we request it and drop the track.
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      display.getVideoTracks().forEach((t) => t.stop());
      const systemAudio = display.getAudioTracks();
      if (!systemAudio.length) {
        display.getTracks().forEach((t) => t.stop());
        throw new Error('No system audio was shared. Enable "Share system audio" in the picker.');
      }
      const systemStream = new MediaStream(systemAudio);
      if (!wantMic) return { stream: systemStream, mixCtx: null };

      const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
      const mixCtx = new AudioContext();
      const dest = mixCtx.createMediaStreamDestination();
      mixCtx.createMediaStreamSource(micStream).connect(dest);
      mixCtx.createMediaStreamSource(systemStream).connect(dest);
      return { stream: dest.stream, mixCtx };
    }

    const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    return { stream: micStream, mixCtx: null };
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setStatus('starting');
      await refreshDevices();

      const { stream, mixCtx } = await acquireStream(source, deviceId);
      streamRef.current = stream;
      mixCtxRef.current = mixCtx;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const recorder = new MediaRecorder(stream, { mimeType: RECORDER_MIME });
      recorderRef.current = recorder;
      pendingClipRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) pendingClipRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const clip = new Blob(pendingClipRef.current, { type: RECORDER_MIME });
        pendingClipRef.current = [];
        if (clip.size > 0) onUtteranceRef.current?.(clip);
      };

      const detector = createUtteranceDetector({
        threshold: vad.threshold,
        silenceMs: vad.silenceMs,
        maxUtteranceMs: vad.maxUtteranceMs,
        onUtterance: () => {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        },
      });

      const timeData = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        const rms = readRmsLevel(analyser, timeData);
        setLevel(rms);
        detector(rms);
      }, POLL_MS);

      // Full teardown for stop() and unmount.
      cleanupRef.current = () => {
        clearInterval(timer);
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
        mixCtxRef.current?.close().catch(() => {});
        mixCtxRef.current = null;
      };

      setStatus('listening');
    } catch (err) {
      console.error('[useAudioCapture]', err);
      setError(err.message);
      setStatus('error');
      cleanupRef.current?.();
    }
  }, [source, deviceId, vad, acquireStream, refreshDevices]);

  useEffect(() => {
    refreshDevices();
    return () => cleanupRef.current?.();
  }, [refreshDevices]);

  // Re-capture when the source changes while listening.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    if (status !== 'listening') return;
    cleanupRef.current?.();
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  return { status, level, devices, error, start, stop, refreshDevices };
}
