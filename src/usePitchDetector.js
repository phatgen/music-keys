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

const MIN_RMS       = 0.005;   // silence threshold (lowered to catch quieter notes)
const MIN_CLARITY   = 0.78;    // pitchy confidence — lower = more sensitive
const HISTORY_MAX   = 80;
const FREQ_MIN      = 150;     // Hz — cuts bass guitar, bass drum rumble
const FREQ_MAX      = 2200;    // Hz — cuts high harmonics / cymbal noise

// Voting window: collect the last VOTE_WINDOW detected notes and emit
// whichever note wins VOTE_THRESHOLD of them. This tolerates occasional
// bad frames without resetting the whole stability counter.
const VOTE_WINDOW    = 8;
const VOTE_THRESHOLD = 5;

export function usePitchDetector() {
  const [note, setNote] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const volBarRef  = useRef(null);  // direct DOM ref for the volume bar
  const debugRef   = useRef(null);  // direct DOM ref for raw debug text

  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);
  const streamRef     = useRef(null);
  const rafRef        = useRef(null);
  const detectorRef   = useRef(null);
  const bufferRef     = useRef(null);
  const voteBufferRef = useRef([]);      // rolling window of recent note keys
  const lastEmitRef   = useRef(null);   // last key added to history

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    audioCtxRef.current = null;
    analyserRef.current  = null;
    streamRef.current    = null;
    rafRef.current       = null;
    detectorRef.current  = null;
    bufferRef.current    = null;
    voteBufferRef.current = [];
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('requesting'); // show "waiting for permission…" immediately
    try {
      // Try with processing disabled first (better for music).
      // Some Windows drivers silently return a dead stream with these constraints,
      // so if we detect silence for 2 seconds we fall back to default constraints.
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
      if (!AudioCtx) throw new Error('Web Audio is not supported in this browser');
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      // iOS Safari creates the AudioContext in a suspended state even inside a
      // user-gesture handler. Resume it explicitly before doing anything else.
      if (audioCtx.state === 'suspended') await audioCtx.resume();

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

      setStatus('listening');

      // If the mic gives us nothing but silence for 2s, warn the user.
      let silentFrames = 0;
      const SILENT_FRAME_LIMIT = 120; // ~2s at 60fps

      function detect() {
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        const rms = getRMS(bufferRef.current);

        // Update the volume bar directly — bypasses React batching for smooth 60fps animation.
        if (volBarRef.current) {
          volBarRef.current.style.width = `${Math.min(100, rms / 0.1 * 100)}%`;
        }

        if (rms < 0.001) {
          silentFrames++;
          if (silentFrames === SILENT_FRAME_LIMIT) {
            setError('Mic is connected but picking up no sound. In Chrome, click the 🔒 icon in the address bar → Site settings → Microphone, make sure the correct device is selected.');
          }
        } else {
          silentFrames = 0;
        }

        if (rms > MIN_RMS) {
          setError(null);

          const [freq, clarity] = detectorRef.current.findPitch(
            bufferRef.current, audioCtx.sampleRate
          );

          if (debugRef.current) {
            const freqStr     = freq    ? `${Math.round(freq)} Hz` : '—';
            const clarityStr  = clarity ? clarity.toFixed(2)       : '—';
            const rmsStr      = rms.toFixed(4);
            const passing     = clarity > MIN_CLARITY && freq >= FREQ_MIN && freq <= FREQ_MAX;
            debugRef.current.textContent = `rms ${rmsStr}  freq ${freqStr}  clarity ${clarityStr}  ${passing ? '✓ passing' : '✗ filtered'}`;
          }

          if (clarity > MIN_CLARITY && freq >= FREQ_MIN && freq <= FREQ_MAX) {
            const detected = freqToNaturalNote(freq);
            if (detected) {
              const key = `${detected.name}${detected.octave}`;

              // Add to voting window
              const buf = voteBufferRef.current;
              buf.push(key);
              if (buf.length > VOTE_WINDOW) buf.shift();

              // Tally votes — find the most common note in the window
              const counts = {};
              for (const k of buf) counts[k] = (counts[k] || 0) + 1;
              const [topKey, topCount] = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])[0];

              if (topCount >= VOTE_THRESHOLD) {
                // Parse key back to name + octave (key format is e.g. "C4", "B3")
                const name   = topKey.slice(0, -1);
                const octave = parseInt(topKey.slice(-1));
                const winner = { name, octave };
                setNote(winner);

                if (lastEmitRef.current !== topKey) {
                  lastEmitRef.current = topKey;
                  setHistory(prev => {
                    const next = [...prev, winner];
                    return next.length > HISTORY_MAX
                      ? next.slice(next.length - HISTORY_MAX)
                      : next;
                  });
                }
              }
            }
          }
        } else {
          // Silence — clear the vote buffer so the same note after a rest
          // registers as a new arrival
          voteBufferRef.current = [];
          lastEmitRef.current   = null;
          setNote(null);
        }

        rafRef.current = requestAnimationFrame(detect);
      }

      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Tap the lock icon in your browser address bar and allow microphone access, then try again.'
        : err.name === 'NotFoundError'
        ? 'No microphone found on this device.'
        : err.message || 'Could not access microphone';
      setError(msg);
      setStatus('error');
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastEmitRef.current = null;
  }, []);

  const isListening  = status === 'listening';
  const isRequesting = status === 'requesting';

  return { note, history, isListening, isRequesting, status, error, volBarRef, debugRef, start, stop, clearHistory };
}
