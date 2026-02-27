// Scrolling strip of detected notes — most recent on the right
export function NoteHistory({ history }) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        Notes will appear here as you play…
      </div>
    );
  }

  return (
    <div className="history-strip">
      {history.map((n, i) => (
        <span
          key={i}
          className={`history-note ${i === history.length - 1 ? 'history-note-current' : ''}`}
        >
          {n.name}
        </span>
      ))}
    </div>
  );
}
