// Piano keyboard showing one octave centered on the detected note
// White keys: C D E F G A B  (7 per octave)
// Black keys: C# D# F# G# A# (5 per octave)

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_POSITIONS = { 'C#': 0, 'D#': 1, 'F#': 3, 'G#': 4, 'A#': 5 }; // index between white keys

function Key({ type, label, active, sharp }) {
  const baseClass = type === 'white' ? 'key-white' : 'key-black';
  const activeClass = active ? (type === 'white' ? 'key-white-active' : 'key-black-active') : '';
  return (
    <div className={`${baseClass} ${activeClass}`} title={label}>
      {type === 'white' && <span className="key-label">{label}</span>}
    </div>
  );
}

export function PianoKeyboard({ activeNote }) {
  // Show two octaves (C3–B4) — a range a child would use
  const octaves = [3, 4];

  return (
    <div className="piano-wrapper">
      {octaves.map(oct => (
        <div className="octave" key={oct}>
          <div className="keys-container">
            {/* White keys */}
            {WHITE_NOTES.map(n => {
              const active = activeNote && activeNote.name === n && activeNote.octave === oct;
              return (
                <Key key={n + oct} type="white" label={n} active={active} />
              );
            })}
            {/* Black keys overlaid */}
            {Object.entries(BLACK_POSITIONS).map(([note, pos]) => {
              const active = activeNote && activeNote.name === note && activeNote.octave === oct;
              return (
                <div
                  key={note + oct}
                  className={`key-black ${active ? 'key-black-active' : ''}`}
                  style={{ left: `calc((${pos} + 1) * (100% / 7))` }}
                  title={note}
                />
              );
            })}
          </div>
          <div className="octave-label">Oct {oct}</div>
        </div>
      ))}
    </div>
  );
}
