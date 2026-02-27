import { useRef, useState, useCallback } from 'react';
import { PitchDetector } from 'pitchy';

// Map frequency (Hz) to the nearest note name and octave
function freqToNote(freq) {
  if (freq <= 0) return null;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const name = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, midi };
}

// Flatten sharps to natural notes for simplicity (optional helper)
function simplifyNote(noteName) {
  // For display we keep sharps as-is
  return noteName;
}

export function usePitchDetector() {
  const [note, setNote] = useState(null);        // { name, octave, midi }
  const [history, setHistory] = useState([]);    // last N distinct notes
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const bufferRef = useRef(null);
  const lastNoteRef = useRef(null);
  const stableCountRef = useRef(0);

  const STABILITY_THRESHOLD = 4;   // frames a note must hold before accepting
  const HISTORY_MAX = 40;
  const MIN_CLARITY = 0.88;        // pitchy clarity score filter (0-1)

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    rafRef.current = null;
    detectorRef.current = null;
    bufferRef.current = null;
    lastNoteRef.current = null;
    stableCountRef.current = 0;
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      bufferRef.current = new Float32Array(bufferLength);
      detectorRef.current = PitchDetector.forFloat32Array(bufferLength);

      setIsListening(true);

      function detect() {
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const [freq, clarity] = detectorRef.current.findPitch(bufferRef.current, audioCtx.sampleRate);

        if (clarity > MIN_CLARITY && freq > 60 && freq < 2000) {
          const detected = freqToNote(freq);
          if (detected) {
            if (lastNoteRef.current === detected.name) {
              stableCountRef.current++;
            } else {
              lastNoteRef.current = detected.name;
              stableCountRef.current = 1;
            }

            if (stableCountRef.current === STABILITY_THRESHOLD) {
              setNote(detected);
              setHistory(prev => {
                // Only append if different from last
                if (prev.length > 0 && prev[prev.length - 1].name === detected.name) return prev;
                const next = [...prev, detected];
                return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
              });
            }
          }
        }

        rafRef.current = requestAnimationFrame(detect);
      }

      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      setError(err.message || 'Could not access microphone');
      setIsListening(false);
    }
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return { note, history, isListening, error, start, stop, clearHistory };
}
