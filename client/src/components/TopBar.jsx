import { useState, useEffect } from 'react';
import { useStore } from '../store';
import * as api from '../api';

const USER_COLORS = [
  '#4a9eff', '#ff4a4a', '#4aff4a', '#ffff4a', '#ff4aff',
  '#4affff', '#ff8c00', '#8c00ff',
];

function getUserColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.split(/[\s-_]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function TopBar({ onOpenDashboard, onOpenReview }) {
  const projects = useStore((s) => s.projects);
  const currentProject = useStore((s) => s.currentProject);
  const setCurrentProject = useStore((s) => s.setCurrentProject);
  const connectedUsers = useStore((s) => s.connectedUsers);
  const currentUser = useStore((s) => s.currentUser);
  const setProjects = useStore((s) => s.setProjects);

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await api.fetchProjects();
        setProjects(data);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      }
    }
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, setProjects]);

  function handleProjectSelect(project) {
    setCurrentProject(project);
    setProjectDropdownOpen(false);
  }

  return (
    <div
      style={{
        height: 48,
        background: '#252525',
        borderBottom: '1px solid #3d3d3d',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* App name */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#4a9eff',
          letterSpacing: -0.5,
          marginRight: 8,
          cursor: 'default',
        }}
      >
        dataTail
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: '#3d3d3d' }} />

      {/* Project selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: '#2d2d2d',
            border: '1px solid #3d3d3d',
            borderRadius: 6,
            color: '#e0e0e0',
            cursor: 'pointer',
            fontSize: 13,
            minWidth: 140,
          }}
        >
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentProject ? currentProject.name : 'Select Project'}
          </span>
          <span style={{ fontSize: 10, color: '#888' }}>
            {projectDropdownOpen ? '^' : 'v'}
          </span>
        </button>

        {projectDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#2d2d2d',
              border: '1px solid #3d3d3d',
              borderRadius: 6,
              minWidth: 200,
              maxHeight: 300,
              overflowY: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              zIndex: 100,
            }}
          >
            {projects.length === 0 && (
              <div style={{ padding: '12px 16px', color: '#666', fontSize: 12 }}>
                No projects
              </div>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => handleProjectSelect(p)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: currentProject?.id === p.id ? '#4a9eff22' : 'transparent',
                  borderBottom: '1px solid #3d3d3d',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (currentProject?.id !== p.id) e.currentTarget.style.background = '#333';
                }}
                onMouseLeave={(e) => {
                  if (currentProject?.id !== p.id) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 13, color: '#e0e0e0', fontWeight: currentProject?.id === p.id ? 600 : 400 }}>
                  {p.name}
                </div>
                {p.description && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {p.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Close dropdown when clicking outside */}
        {projectDropdownOpen && (
          <div
            onClick={() => setProjectDropdownOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99,
            }}
          />
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Connected users */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {connectedUsers
          .filter((u) => u !== currentUser)
          .map((user, idx) => (
            <div
              key={user + idx}
              title={user}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: getUserColor(user),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                border: '2px solid #252525',
                marginLeft: idx > 0 ? -6 : 0,
              }}
            >
              {getInitials(user)}
            </div>
          ))}
      </div>

      {/* Dashboard button */}
      <button
        onClick={onOpenDashboard}
        title="Dataset Health Dashboard"
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid #3d3d3d',
          borderRadius: 6,
          color: '#b0b0b0',
          cursor: 'pointer',
          fontSize: 12,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#4a9eff';
          e.currentTarget.style.color = '#4a9eff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#3d3d3d';
          e.currentTarget.style.color = '#b0b0b0';
        }}
      >
        Dashboard
      </button>

      {/* Review button */}
      <button
        onClick={onOpenReview}
        title="Quality Review"
        style={{
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid #3d3d3d',
          borderRadius: 6,
          color: '#b0b0b0',
          cursor: 'pointer',
          fontSize: 12,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#4a9eff';
          e.currentTarget.style.color = '#4a9eff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#3d3d3d';
          e.currentTarget.style.color = '#b0b0b0';
        }}
      >
        Review
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: '#3d3d3d' }} />

      {/* Current user */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: getUserColor(currentUser),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {getInitials(currentUser)}
        </div>
        <span style={{ fontSize: 12, color: '#b0b0b0' }}>{currentUser}</span>
      </div>
    </div>
  );
}
