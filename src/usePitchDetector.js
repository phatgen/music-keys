import { useRef, useState, useCallback } from 'react';

// ml5 is loaded via CDN script tag in index.html — access via window.ml5
const getML5 = () => window.ml5;

// CREPE model hosted on the ml5 CDN
const CREPE_MODEL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

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
const FREQ_MIN       = 150;   // Hz — still blocks bass rumble
const FREQ_MAX       = 2200;  // Hz

// CREPE runs slower than 60fps, so a smaller voting window still gives ~200ms of context
const VOTE_WINDOW    = 5;
const VOTE_THRESHOLD = 3;

export function usePitchDetector() {
  const [note,    setNote]    = useState(null);
  const [history, setHistory] = useState([]);
  // idle | requesting | loading | listening | error
  const [status,  setStatus]  = useState('idle');
  const [error,   setError]   = useState(null);

  const pitchRef      = useRef(null);   // ml5 pitch detector
  const streamRef     = useRef(null);
  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);   // separate analyser just for the volume bar
  const bufferRef     = useRef(null);
  const detectingRef  = useRef(false);  // guard to stop the callback loop on stop()
  const voteBufferRef = useRef([]);
  const lastEmitRef   = useRef(null);
  const volBarRef     = useRef(null);
  const debugRef      = useRef(null);

  const stop = useCallback(() => {
    detectingRef.current = false;
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    streamRef.current    = null;
    audioCtxRef.current  = null;
    analyserRef.current  = null;
    bufferRef.current    = null;
    pitchRef.current     = null;
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

      // Separate analyser branch just for the volume bar animation
      const source  = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current   = new Float32Array(analyser.fftSize);

      // Animate the volume bar independently of pitch detection
      function animateVolume() {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const rms = getRMS(bufferRef.current);
        if (volBarRef.current) {
          volBarRef.current.style.width = `${Math.min(100, rms / 0.1 * 100)}%`;
        }
        requestAnimationFrame(animateVolume);
      }
      requestAnimationFrame(animateVolume);

      // Load CREPE model (takes a few seconds on first load)
      setStatus('loading');
      if (debugRef.current) debugRef.current.textContent = 'Loading CREPE model…';

      const ml5 = getML5();
      if (!ml5) throw new Error('ml5 library not loaded — check your internet connection and refresh.');

      const pitch = await new Promise((resolve, reject) => {
        const p = ml5.pitchDetection(CREPE_MODEL, audioCtx, stream, (err) => {
          if (err) reject(new Error(`Model load failed: ${err}`));
          else resolve(p);
        });
      });
      pitchRef.current   = pitch;
      detectingRef.current = true;
      setStatus('listening');

      // Callback loop — CREPE calls back when each inference is done (~20-30/s)
      function detect() {
        if (!detectingRef.current) return;

        pitch.getPitch((err, frequency) => {
          if (!detectingRef.current) return;

          if (frequency && frequency >= FREQ_MIN && frequency <= FREQ_MAX) {
            if (debugRef.current) {
              debugRef.current.textContent = `${Math.round(frequency)} Hz ✓`;
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
            // No pitch / out of range — treat as silence
            voteBufferRef.current = [];
            lastEmitRef.current   = null;
            setNote(null);
            if (debugRef.current && frequency) {
              debugRef.current.textContent = `${Math.round(frequency)} Hz ✗ out of range`;
            } else if (debugRef.current) {
              debugRef.current.textContent = 'no pitch detected';
            }
          }

          detect(); // schedule next inference
        });
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

  const isListening  = status === 'listening';
  const isRequesting = status === 'requesting' || status === 'loading';

  return {
    note, history, isListening, isRequesting, status,
    error, volBarRef, debugRef, start, stop, clearHistory,
  };
}
