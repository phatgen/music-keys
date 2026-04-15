// Piano keyboard showing one octave centered on the detected note
// White keys: C D E F G A B  (7 per octave)
// Black keys: C# D# F# G# A# (5 per octave)

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_POSITIONS = { 'C#': 0, 'D#': 1, 'F#': 3, 'G#': 4, 'A#': 5 }; // index between white keys

// expected (green, pulsing) takes visual priority over active (purple)
function Key({ type, label, active, expected }) {
  const base = type === 'white' ? 'key-white' : 'key-black';
  const mod  = expected ? (type === 'white' ? 'key-white-expected' : 'key-black-expected')
             : active   ? (type === 'white' ? 'key-white-active'   : 'key-black-active')
             : '';
  return (
    <div className={`${base} ${mod}`} title={label}>
      {type === 'white' && <span className="key-label">{label}</span>}
    </div>
  );
}

// activeNote  = what the mic currently hears (purple)
// expectedNote = the note the user should play next (green, pulsing)
export function PianoKeyboard({ activeNote, expectedNote }) {
  const octaves = [3, 4];

  return (
    <div className="piano-wrapper">
      {octaves.map(oct => (
        <div className="octave" key={oct}>
          <div className="keys-container">
            {WHITE_NOTES.map(n => {
              const active   = activeNote   && activeNote.name   === n && activeNote.octave   === oct;
              const expected = expectedNote && expectedNote.name === n && expectedNote.octave === oct;
              return (
                <Key key={n + oct} type="white" label={n} active={active} expected={expected} />
              );
            })}
            {Object.entries(BLACK_POSITIONS).map(([note, pos]) => {
              const active   = activeNote   && activeNote.name   === note && activeNote.octave   === oct;
              const expected = expectedNote && expectedNote.name === note && expectedNote.octave === oct;
              return (
                <div
                  key={note + oct}
                  className={`key-black ${expected ? 'key-black-expected' : active ? 'key-black-active' : ''}`}
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
