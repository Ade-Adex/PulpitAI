// useTranscriber: receives audio clips from the capture hook, ships them to
// the Electron pipeline, and collects finished Yoruba/English segments.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { blobToBase64 } from '../lib/audio.js';

export function useTranscriber() {
  const [segments, setSegments] = useState([]);
  const [pipelineState, setPipelineState] = useState('idle');
  const [lastError, setLastError] = useState(null);
  const busyRef = useRef(false);

  // Subscribe to segments pushed from the main process (also covers any
  // future path where segments arrive outside our direct invoke()).
  useEffect(() => {
    const unsubscribe = api.onSegment((segment) => {
      setSegments((prev) => [...prev.slice(-199), segment]); // cap at 200
    });
    const unsubStatus = api.onPipelineStatus((status) => {
      setPipelineState(status.state);
      if (status.state === 'error') setLastError(status.message);
    });
    return () => {
      unsubscribe();
      unsubStatus();
    };
  }, []);

  const submitClip = useCallback(async (clip) => {
    if (busyRef.current) return; // drop overlapping clips; preaching is sequential
    busyRef.current = true;
    try {
      const audioBase64 = await blobToBase64(clip);
      await api.transcribeChunk(audioBase64);
      setLastError(null);
    } catch (err) {
      setLastError(err.message);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const clearSegments = useCallback(() => setSegments([]), []);

  return { segments, pipelineState, lastError, submitClip, clearSegments };
}
