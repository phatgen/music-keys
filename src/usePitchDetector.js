import { useRef, useState, useCallback } from 'react';
import { PitchDetector } from 'pitchy';

// Sharps round DOWN to nearest natural note (C#→C, F#→F, etc.)
const CHROMA_TO_NATURAL = ['C','C','D','D','E','F','F','G','G','A','A','B'];

function freqToNaturalNote(freq) {
  if (!freq || freq <= 0) return null;
  const midi   = Math.round(12 * Math.log2(freq / 440) + 69);
  const chroma = ((midi % 12) + 12) % 12;
  const name   = CHROMA_TO_NATURAL[chroma];
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave };
}

function getRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

const HISTORY_MAX    = 80;
const FFT_SIZE       = 2048;
const MIN_RMS        = 0.005;
const MIN_CLARITY    = 0.40;   // very permissive — melody through speakers has weak clarity
const FREQ_MIN       = 150;    // Hz — blocks bass rumble (50-70 Hz range we measured)
const FREQ_MAX       = 2200;   // Hz

const VOTE_WINDOW    = 8;
const VOTE_THRESHOLD = 3;      // 3/8 majority — permissive but stable

export function usePitchDetector() {
  const [note,    setNote]    = useState(null);
  const [history, setHistory] = useState([]);
  // idle | requesting | listening | error
  const [status,  setStatus]  = useState('idle');
  const [error,   setError]   = useState(null);

  const streamRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);
  const bufferRef     = useRef(null);
  const detectorRef   = useRef(null);
  const rafRef        = useRef(null);
  const detectingRef  = useRef(false);
  const voteBufferRef = useRef([]);
  const lastEmitRef   = useRef(null);
  const volBarRef     = useRef(null);
  const debugRef      = useRef(null);

  const stop = useCallback(() => {
    detectingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    streamRef.current    = null;
    audioCtxRef.current  = null;
    analyserRef.current  = null;
    bufferRef.current    = null;
    detectorRef.current  = null;
    voteBufferRef.current = [];
    lastEmitRef.current  = null;
    setStatus('idle');
    setNote(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('requesting');
    try {
      // Get mic stream with audio processing disabled for music
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio not supported in this browser');
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      // Build audio graph: source → highpass → analyser
      const source = audioCtx.createMediaStreamSource(stream);

      // Highpass filter to strip bass rumble below FREQ_MIN
      const hpf = audioCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = FREQ_MIN;
      hpf.Q.value = 0.7;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(hpf);
      hpf.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Float32Array(FFT_SIZE);
      bufferRef.current = buffer;

      detectorRef.current = PitchDetector.forFloat32Array(FFT_SIZE);

      detectingRef.current = true;
      setStatus('listening');

      function detect() {
        if (!detectingRef.current) return;

        analyser.getFloatTimeDomainData(buffer);
        const rms = getRMS(buffer);

        // Update volume bar via DOM ref (avoids React state batching at 60fps)
        if (volBarRef.current) {
          volBarRef.current.style.width = `${Math.min(100, rms / 0.1 * 100)}%`;
        }

        if (rms < MIN_RMS) {
          // Too quiet — treat as silence
          voteBufferRef.current = [];
          lastEmitRef.current   = null;
          setNote(null);
          if (debugRef.current) debugRef.current.textContent = `rms ${rms.toFixed(4)} — silent`;
          rafRef.current = requestAnimationFrame(detect);
          return;
        }

        const [frequency, clarity] = detectorRef.current.findPitch(buffer, audioCtx.sampleRate);

        if (debugRef.current) {
          debugRef.current.textContent =
            `rms ${rms.toFixed(4)} | ${Math.round(frequency)} Hz | clarity ${clarity.toFixed(2)}`;
        }

        if (
          clarity >= MIN_CLARITY &&
          frequency >= FREQ_MIN &&
          frequency <= FREQ_MAX
        ) {
          if (debugRef.current) {
            debugRef.current.textContent += ' ✓';
          }

          const detected = freqToNaturalNote(frequency);
          if (detected) {
            const key = `${detected.name}${detected.octave}`;

            const buf = voteBufferRef.current;
            buf.push(key);
            if (buf.length > VOTE_WINDOW) buf.shift();

            const counts = {};
            for (const k of buf) counts[k] = (counts[k] || 0) + 1;
            const [topKey, topCount] = Object.entries(counts)
              .sort((a, b) => b[1] - a[1])[0];

            if (topCount >= VOTE_THRESHOLD) {
              const name   = topKey.slice(0, -1);
              const octave = parseInt(topKey.slice(-1));
              const winner = { name, octave };
              setNote(winner);

              if (lastEmitRef.current !== topKey) {
                lastEmitRef.current = topKey;
                setHistory(prev => {
                  const next = [...prev, winner];
                  return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
                });
              }
            }
          }
        } else {
          // Below clarity/range threshold — treat as silence
          voteBufferRef.current = [];
          lastEmitRef.current   = null;
          setNote(null);
          if (debugRef.current) debugRef.current.textContent += ' ✗';
        }

        rafRef.current = requestAnimationFrame(detect);
      }

      detect();
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Check the 🔒 icon in the address bar.'
        : err.name === 'NotFoundError'
        ? 'No microphone found on this device.'
        : err.message || 'Could not start';
      setError(msg);
      setStatus('error');
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastEmitRef.current = null;
  }, []);

  const loadHistory = useCallback((notes) => {
    setHistory(notes);
    lastEmitRef.current = null;
  }, []);

  const isListening  = status === 'listening';
  const isRequesting = status === 'requesting';

  return {
    note, history, isListening, isRequesting, status,
    error, volBarRef, debugRef, start, stop, clearHistory, loadHistory,
  };
}
