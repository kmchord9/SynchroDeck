export default function App() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#94a3b8',
      fontFamily: "'Segoe UI', sans-serif",
      gap: 16,
    }}>
      <div style={{ fontSize: 48, color: '#6366f1' }}>⬡</div>
      <h1 style={{ margin: 0, fontSize: 28, color: '#f1f5f9', fontWeight: 600 }}>
        SynchroDeck
      </h1>
      <p style={{ margin: 0, fontSize: 16 }}>
        SVG スライドファイルを開くとここにプレビューが表示されます
      </p>
    </div>
  );
}
