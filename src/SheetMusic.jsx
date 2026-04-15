import { useRef, useEffect } from 'react';

// ── Layout constants ─────────────────────────────────────────────────────────
const LINE_SPACING  = 14;                      // px between staff lines
const HALF_STEP     = LINE_SPACING / 2;        // 7px per diatonic step (half a space)
const NOTE_R_X      = 6;                       // note head x-radius
const NOTE_R_Y      = 5;                       // note head y-radius (slightly squashed)
const STEM_LEN      = LINE_SPACING * 3;        // stem length in px

const STAFF_TOP_PAD = 4 * LINE_SPACING;        // room above top line for high notes
const STAFF_HEIGHT  = 4 * LINE_SPACING;        // distance from line 1 to line 5
const STAFF_BOT_PAD = 4 * LINE_SPACING;        // room below bottom line for C4 ledger
const SVG_HEIGHT    = STAFF_TOP_PAD + STAFF_HEIGHT + STAFF_BOT_PAD;

// Y coordinate of the bottom staff line (E4, step 0)
const BOTTOM_LINE_Y = STAFF_TOP_PAD + STAFF_HEIGHT;

const CLEF_W        = 52;                      // width reserved for the clef
const NOTE_SPACING  = 36;                      // horizontal px between note centers
const MIN_NOTES_W   = 10;                      // minimum columns shown (empty space)

// ── Music theory helpers ─────────────────────────────────────────────────────

// Diatonic index within an octave (C=0 … B=6)
const DIATONIC_IDX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Treble clef reference: E4 is on line 1 (step 0).
// step = -2 + (octave - 4) * 7 + diatonic_index
// Verified: C4→-2, E4→0, G4→2, B4→4, C5→5, D5→6, F5→8
function noteToStep(name, octave) {
  const idx = DIATONIC_IDX[name];
  if (idx === undefined) return null;
  return -2 + (octave - 4) * 7 + idx;
}

// Convert a staff step to an SVG y coordinate
function stepToY(step) {
  return BOTTOM_LINE_Y - step * HALF_STEP;
}

// Ledger lines required for a note outside the staff (steps 0–8)
function ledgerLines(step) {
  const lines = [];
  if (step >= 0 && step <= 8) return lines;
  if (step < 0) {
    // Below: draw at -2, -4, … down to (or past) the note
    for (let s = -2; s >= step - (step % 2 === 0 ? 0 : 1); s -= 2) lines.push(s);
  } else {
    // Above: draw at 10, 12, … up to the note
    for (let s = 10; s <= step + (step % 2 === 0 ? 0 : 1); s += 2) lines.push(s);
  }
  return lines;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SheetMusic({ notes, highlightIndex }) {
  const scrollRef = useRef(null);

  // highlightIndex: if provided, scroll to center that note; else scroll to end
  useEffect(() => {
    if (!scrollRef.current) return;
    if (highlightIndex !== undefined && highlightIndex !== null) {
      const noteX    = CLEF_W + highlightIndex * NOTE_SPACING + NOTE_SPACING / 2;
      const halfWide = scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, noteX - halfWide);
    } else {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [notes.length, highlightIndex]);

  const cols    = Math.max(MIN_NOTES_W, notes.length);
  const svgW    = CLEF_W + cols * NOTE_SPACING + 16;

  // The 5 staff lines sit at steps 0, 2, 4, 6, 8
  const staffLineYs = [0, 2, 4, 6, 8].map(stepToY);

  return (
    <div
      ref={scrollRef}
      className="sheet-scroll"
    >
      <svg width={svgW} height={SVG_HEIGHT} style={{ display: 'block' }}>

        {/* ── Staff lines (extend full width) ── */}
        {staffLineYs.map((y, i) => (
          <line
            key={i}
            x1={CLEF_W - 4} y1={y}
            x2={svgW - 4}  y2={y}
            stroke="#444" strokeWidth={1.2}
          />
        ))}

        {/* ── Treble clef ── */}
        {/* The G-clef glyph (U+1D11E). Rendered large with serif font.
            Positioned so its curl wraps around the G4 line (step 2). */}
        <text
          x={0}
          y={BOTTOM_LINE_Y + LINE_SPACING * 1.35}
          fontSize={SVG_HEIGHT * 0.78}
          fontFamily="'Times New Roman', 'Palatino Linotype', Georgia, serif"
          fill="#333"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          𝄞
        </text>

        {/* ── Notes ── */}
        {notes.map((n, i) => {
          const step = noteToStep(n.name, n.octave);
          if (step === null) return null;

          const x       = CLEF_W + i * NOTE_SPACING + NOTE_SPACING / 2;
          const y       = stepToY(step);
          // "current" = highlighted note; falls back to last note when no index given
          const current = highlightIndex !== undefined && highlightIndex !== null
            ? i === highlightIndex
            : i === notes.length - 1;
          const stemUp  = step < 4;   // below B4 → stem goes up
          const color   = current ? '#6c63ff' : '#1a1a2e';

          const ledgers = ledgerLines(step);

          // Stem: attaches to right side of head when up, left when down
          const stemX   = stemUp ? x + NOTE_R_X - 1 : x - NOTE_R_X + 1;
          const stemY1  = y;
          const stemY2  = stemUp ? y - STEM_LEN : y + STEM_LEN;

          return (
            <g key={i}>
              {/* Ledger lines */}
              {ledgers.map(ls => (
                <line
                  key={ls}
                  x1={x - NOTE_R_X - 4} y1={stepToY(ls)}
                  x2={x + NOTE_R_X + 4} y2={stepToY(ls)}
                  stroke="#444" strokeWidth={1.2}
                />
              ))}

              {/* Note head */}
              <ellipse
                cx={x} cy={y}
                rx={NOTE_R_X} ry={NOTE_R_Y}
                fill={color}
              />

              {/* Stem */}
              <line
                x1={stemX} y1={stemY1}
                x2={stemX} y2={stemY2}
                stroke={color} strokeWidth={1.5}
              />

              {/* Note name below/above the head (helps the child confirm the note) */}
              <text
                x={x}
                y={stemUp ? y + NOTE_R_Y + 12 : y - NOTE_R_Y - 5}
                textAnchor="middle"
                fontSize={9}
                fontFamily="sans-serif"
                fontWeight={current ? '700' : '500'}
                fill={current ? '#6c63ff' : '#666'}
                style={{ userSelect: 'none' }}
              >
                {n.name}{n.octave}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
