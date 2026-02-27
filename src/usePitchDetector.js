import { useRef, useState, useCallback } from 'react';
import { PitchDetector } from 'pitchy';

// Sharps round DOWN to the natural note below (C# → C, F# → F, etc.)
const CHROMA_TO_NATURAL = ['C','C','D','D','E','F','F','G','G','A','A','B'];

function freqToNaturalNote(freq) {
  if (!freq || freq <= 0) return null;
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const chroma = ((midi % 12) + 12) % 12;
  const name = CHROMA_TO_NATURAL[chroma];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave };
}

function getRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

const MIN_RMS = 0.01;          // silence / background noise threshold
const MIN_CLARITY = 0.85;      // pitchy confidence filter (lower = more sensitive)
const STABILITY_FRAMES = 5;    // frames (~83ms) a note must hold before emitting
const HISTORY_MAX = 80;
const FREQ_MIN = 150;          // Hz  — cuts bass guitar, bass drum rumble
const FREQ_MAX = 2200;         // Hz  — cuts high harmonics / cymbal noise

export function usePitchDetector() {
  const [note, setNote] = useState(null);
  const [history, setHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);
  const streamRef     = useRef(null);
  const rafRef        = useRef(null);
  const detectorRef   = useRef(null);
  const bufferRef     = useRef(null);
  const candidateRef  = useRef(null);   // "note4" style key of candidate note
  const stabilityRef  = useRef(0);      // consecutive frames held
  const lastEmitRef   = useRef(null);   // last key added to history

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current   = null;
    rafRef.current      = null;
    detectorRef.current = null;
    bufferRef.current   = null;
    candidateRef.current = null;
    stabilityRef.current = 0;
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Bandpass: strip bass frequencies (< 180 Hz) and very high harmonics (> 2500 Hz).
      // This is the single biggest improvement for multi-instrument music — cuts drums,
      // bass guitar, and noise that confuses the pitch detector.
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      hp.Q.value = 0.5;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      lp.Q.value = 0.5;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      source.connect(hp);
      hp.connect(lp);
      lp.connect(analyser);

      bufferRef.current   = new Float32Array(analyser.fftSize);
      detectorRef.current = PitchDetector.forFloat32Array(analyser.fftSize);

      setIsListening(true);

      function detect() {
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const rms = getRMS(bufferRef.current);

        if (rms > MIN_RMS) {
          const [freq, clarity] = detectorRef.current.findPitch(
            bufferRef.current, audioCtx.sampleRate
          );

          if (clarity > MIN_CLARITY && freq >= FREQ_MIN && freq <= FREQ_MAX) {
            const detected = freqToNaturalNote(freq);
            if (detected) {
              const key = `${detected.name}${detected.octave}`;

              if (candidateRef.current === key) {
                stabilityRef.current++;
              } else {
                candidateRef.current = key;
                stabilityRef.current = 1;
              }

              if (stabilityRef.current === STABILITY_FRAMES) {
                setNote(detected);
                // Only push to history when transitioning to a new note
                if (lastEmitRef.current !== key) {
                  lastEmitRef.current = key;
                  setHistory(prev => {
                    const next = [...prev, detected];
                    return next.length > HISTORY_MAX
                      ? next.slice(next.length - HISTORY_MAX)
                      : next;
                  });
                }
              }
            }
          }
        } else {
          // Silence — reset candidate so the next note counts as a fresh arrival,
          // even if it's the same pitch (e.g., same note played again after a rest)
          candidateRef.current = null;
          stabilityRef.current = 0;
          lastEmitRef.current  = null;
          setNote(null);
        }

        rafRef.current = requestAnimationFrame(detect);
      }

      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      setError(err.message || 'Could not access microphone');
      setIsListening(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastEmitRef.current = null;
  }, []);

  return { note, history, isListening, error, start, stop, clearHistory };
}
