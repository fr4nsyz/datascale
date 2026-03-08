import { useState, useEffect } from 'react';
import { useStore } from '../store';
import * as api from '../api';

const ACCENT = '#6C5CE7';
const BORDER = '#e5e5e5';

export default function ExportPanel({ isOpen, onClose }) {
  const currentProject = useStore((s) => s.currentProject);
  const [format, setFormat] = useState('coco');
  const [includeImages, setIncludeImages] = useState(false);
  const [summary, setSummary] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !currentProject) return;
    setSummary(null);
    setError(null);
    api.exportSummary(currentProject.id).then(setSummary).catch(() => {});
  }, [isOpen, currentProject]);

  if (!isOpen) return null;

  async function handleExport() {
    if (!currentProject) return;
    setExporting(true);
    setError(null);
    try {
      await api.exportDataset(currentProject.id, format, includeImages);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const cardStyle = (selected) => ({
    flex: 1,
    padding: '16px 20px',
    background: selected ? 'rgba(108, 92, 231, 0.08)' : '#fafafa',
    border: selected ? `2px solid ${ACCENT}` : `2px solid ${BORDER}`,
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 520,
          background: '#fff',
          borderRadius: 14,
          border: `1px solid ${BORDER}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: '#333' }}>
            Export Dataset
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#f5f5f5',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#888',
              fontSize: 16,
              lineHeight: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#eee'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f5f5f5'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Format picker */}
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
            Format
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
            <div style={cardStyle(format === 'coco')} onClick={() => setFormat('coco')}>
              <div style={{ fontSize: 15, fontWeight: 700, color: format === 'coco' ? ACCENT : '#333' }}>
                COCO JSON
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                annotations.json with images[], annotations[], categories[]
              </div>
            </div>
            <div style={cardStyle(format === 'yolo')} onClick={() => setFormat('yolo')}>
              <div style={{ fontSize: 15, fontWeight: 700, color: format === 'yolo' ? ACCENT : '#333' }}>
                YOLO TXT
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                labels/ directory with per-image .txt files + classes.txt
              </div>
            </div>
          </div>

          {/* Include images checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              marginBottom: 22,
              padding: '12px 16px',
              background: '#fafafa',
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
            }}
          >
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(e) => setIncludeImages(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: ACCENT }}
            />
            <div>
              <div style={{ fontSize: 13, color: '#333', fontWeight: 500 }}>Include images</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Bundles image files in the ZIP (larger download)
              </div>
            </div>
          </label>

          {/* Summary */}
          {summary && (
            <div
              style={{
                padding: '14px 16px',
                background: '#fafafa',
                borderRadius: 10,
                border: `1px solid ${BORDER}`,
                marginBottom: 22,
                display: 'flex',
                gap: 24,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#333' }}>{summary.images}</div>
                <div style={{ fontSize: 11, color: '#888' }}>images</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#333' }}>{summary.annotations}</div>
                <div style={{ fontSize: 11, color: '#888' }}>annotations</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#333' }}>{summary.classes}</div>
                <div style={{ fontSize: 11, color: '#888' }}>classes</div>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(231, 76, 60, 0.08)',
                border: '1px solid rgba(231, 76, 60, 0.2)',
                borderRadius: 8,
                color: '#e74c3c',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              width: '100%',
              padding: '12px 0',
              background: exporting ? '#5a4bd6' : ACCENT,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: exporting ? 'default' : 'pointer',
              opacity: exporting ? 0.7 : 1,
              transition: 'all 0.15s',
              boxShadow: '0 2px 8px rgba(108, 92, 231, 0.25)',
            }}
            onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = '#5a4bd6'; }}
            onMouseLeave={(e) => { if (!exporting) e.currentTarget.style.background = ACCENT; }}
          >
            {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
