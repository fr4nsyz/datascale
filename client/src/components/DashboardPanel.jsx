import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { useStore } from '../store';
import * as api from '../api';

const GRADE_COLORS = {
  A: '#4aff4a',
  B: '#a0ff4a',
  C: '#ffff4a',
  D: '#ff8c00',
  F: '#ff4a4a',
};

const BAR_COLORS = [
  '#4a9eff', '#ff4a4a', '#4aff4a', '#ffff4a', '#ff4aff',
  '#4affff', '#ff8c00', '#8c00ff', '#ff6699', '#66ff99',
];

function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export default function DashboardPanel({ isOpen, onClose }) {
  const currentProject = useStore((s) => s.currentProject);
  const datasetHealth = useStore((s) => s.datasetHealth);
  const setDatasetHealth = useStore((s) => s.setDatasetHealth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.datasetHealth(currentProject.id);
      setDatasetHealth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentProject, setDatasetHealth]);

  useEffect(() => {
    if (!isOpen) return;
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [isOpen, fetchHealth]);

  if (!isOpen) return null;

  const health = datasetHealth;
  const qualityScore = health?.quality_score ?? 0;
  const grade = getLetterGrade(qualityScore);
  const classDistribution = health?.class_distribution || [];
  const annotationProgress = health?.annotation_progress || { annotated: 0, total: 0 };
  const annotatorStats = health?.annotator_stats || [];
  const recentIssues = health?.recent_issues || [];
  const progressPct = annotationProgress.total > 0
    ? Math.round((annotationProgress.annotated / annotationProgress.total) * 100)
    : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 700,
          maxHeight: '85vh',
          background: '#1e1e1e',
          borderRadius: 12,
          border: '1px solid #3d3d3d',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #3d3d3d',
            background: '#252525',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e0e0' }}>
            Dataset Health Dashboard
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={fetchHealth}
              disabled={loading}
              style={{
                padding: '4px 12px',
                background: '#4a9eff22',
                border: '1px solid #4a9eff',
                borderRadius: 4,
                color: '#4a9eff',
                cursor: loading ? 'default' : 'pointer',
                fontSize: 12,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 20,
                padding: '0 4px',
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#ff4a4a22',
                border: '1px solid #ff4a4a44',
                borderRadius: 6,
                color: '#ff4a4a',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {loading && !health && (
            <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
              Loading dashboard data...
            </div>
          )}

          {health && (
            <>
              {/* Quality Score */}
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: 24,
                  padding: 20,
                  background: '#252525',
                  borderRadius: 8,
                  border: '1px solid #3d3d3d',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Quality Score
                </div>
                <div
                  style={{
                    fontSize: 64,
                    fontWeight: 800,
                    color: GRADE_COLORS[grade] || '#e0e0e0',
                    lineHeight: 1,
                  }}
                >
                  {grade}
                </div>
                <div style={{ fontSize: 20, color: '#e0e0e0', marginTop: 4 }}>
                  {qualityScore}/100
                </div>
              </div>

              {/* Annotation Progress */}
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  background: '#252525',
                  borderRadius: 8,
                  border: '1px solid #3d3d3d',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Annotation Progress
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 12,
                      background: '#3d3d3d',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: progressPct >= 80 ? '#4aff4a' : progressPct >= 50 ? '#ffff4a' : '#ff8c00',
                        borderRadius: 6,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, color: '#e0e0e0', fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
                    {progressPct}%
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                  {annotationProgress.annotated} of {annotationProgress.total} images annotated
                </div>
              </div>

              {/* Class Distribution */}
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  background: '#252525',
                  borderRadius: 8,
                  border: '1px solid #3d3d3d',
                }}
              >
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Class Distribution
                </div>
                {classDistribution.length > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <BarChart width={600} height={200} data={classDistribution}>
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#888', fontSize: 11 }}
                        axisLine={{ stroke: '#3d3d3d' }}
                        tickLine={{ stroke: '#3d3d3d' }}
                      />
                      <YAxis
                        tick={{ fill: '#888', fontSize: 11 }}
                        axisLine={{ stroke: '#3d3d3d' }}
                        tickLine={{ stroke: '#3d3d3d' }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#2d2d2d',
                          border: '1px solid #3d3d3d',
                          borderRadius: 4,
                          color: '#e0e0e0',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {classDistribution.map((entry, index) => (
                          <Cell key={index} fill={entry.color || BAR_COLORS[index % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#666', fontSize: 12, padding: 16 }}>
                    No class data available
                  </div>
                )}
              </div>

              {/* Annotator Stats */}
              {annotatorStats.length > 0 && (
                <div
                  style={{
                    marginBottom: 24,
                    padding: 16,
                    background: '#252525',
                    borderRadius: 8,
                    border: '1px solid #3d3d3d',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Annotator Stats
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#888', borderBottom: '1px solid #3d3d3d' }}>
                          Annotator
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', borderBottom: '1px solid #3d3d3d' }}>
                          Annotations
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', borderBottom: '1px solid #3d3d3d' }}>
                          Images
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', borderBottom: '1px solid #3d3d3d' }}>
                          Avg. Quality
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {annotatorStats.map((stat, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: '#e0e0e0', borderBottom: '1px solid #2a2a2a' }}>
                            {stat.name || stat.user || 'Unknown'}
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: '#e0e0e0', textAlign: 'right', borderBottom: '1px solid #2a2a2a' }}>
                            {stat.annotation_count ?? stat.annotations ?? 0}
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: '#e0e0e0', textAlign: 'right', borderBottom: '1px solid #2a2a2a' }}>
                            {stat.image_count ?? stat.images ?? 0}
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12, color: '#e0e0e0', textAlign: 'right', borderBottom: '1px solid #2a2a2a' }}>
                            {stat.avg_quality != null ? `${Math.round(stat.avg_quality)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent Issues */}
              {recentIssues.length > 0 && (
                <div
                  style={{
                    padding: 16,
                    background: '#252525',
                    borderRadius: 8,
                    border: '1px solid #3d3d3d',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Recent Review Issues
                  </div>
                  {recentIssues.map((issue, idx) => {
                    const sevColors = { error: '#ff4a4a', warning: '#ffff4a', info: '#4a9eff' };
                    const severity = issue.severity || 'info';
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: idx < recentIssues.length - 1 ? '1px solid #2a2a2a' : 'none',
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: sevColors[severity] || '#888',
                            marginTop: 4,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: '#e0e0e0' }}>{issue.message}</div>
                          {issue.suggestion && (
                            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{issue.suggestion}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
