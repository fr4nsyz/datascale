import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import * as api from '../api';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ProjectList() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.fetchProjects();
        setProjects(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setProjects]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await api.createProject(newName.trim(), newDescription.trim());
      setProjects([...projects, project]);
      setNewName('');
      setNewDescription('');
      setShowForm(false);
      navigate(`/project/${project.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: '#1e1e1e',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '24px 32px',
          borderBottom: '1px solid #3d3d3d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#4a9eff',
              letterSpacing: -0.5,
            }}
          >
            dataTail
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Annotation Projects
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
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

        {loading && (
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
            Loading projects...
          </div>
        )}

        {!loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                style={{
                  background: '#252525',
                  border: '1px solid #3d3d3d',
                  borderRadius: 10,
                  padding: 20,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 140,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4a9eff';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(74,158,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#3d3d3d';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e0e0', marginBottom: 6 }}>
                  {project.name}
                </div>
                {project.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#888',
                      marginBottom: 12,
                      flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {project.description}
                  </div>
                )}
                {!project.description && <div style={{ flex: 1 }} />}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {project.image_count != null && (
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {project.image_count} image{project.image_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {project.annotation_count != null && (
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {project.annotation_count} annotation{project.annotation_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {(project.updated_at || project.created_at) && (
                    <span style={{ fontSize: 11, color: '#666' }}>
                      {formatDate(project.updated_at || project.created_at)}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* New Project Card */}
            {!showForm ? (
              <div
                onClick={() => setShowForm(true)}
                style={{
                  background: 'transparent',
                  border: '2px dashed #3d3d3d',
                  borderRadius: 10,
                  padding: 20,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 140,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4a9eff';
                  e.currentTarget.style.background = '#4a9eff08';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#3d3d3d';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 32, color: '#555', marginBottom: 8, lineHeight: 1 }}>+</div>
                <div style={{ fontSize: 14, color: '#888' }}>New Project</div>
              </div>
            ) : (
              <div
                style={{
                  background: '#252525',
                  border: '1px solid #4a9eff',
                  borderRadius: 10,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minHeight: 140,
                }}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setShowForm(false);
                  }}
                  placeholder="Project name"
                  style={{
                    padding: '8px 12px',
                    background: '#1e1e1e',
                    border: '1px solid #555',
                    borderRadius: 6,
                    color: '#e0e0e0',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  style={{
                    padding: '8px 12px',
                    background: '#1e1e1e',
                    border: '1px solid #555',
                    borderRadius: 6,
                    color: '#e0e0e0',
                    fontSize: 13,
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: newName.trim() && !creating ? '#4a9eff' : '#3d3d3d',
                      color: newName.trim() && !creating ? '#fff' : '#666',
                      border: 'none',
                      borderRadius: 6,
                      cursor: newName.trim() && !creating ? 'pointer' : 'default',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setNewName('');
                      setNewDescription('');
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#3d3d3d',
                      color: '#b0b0b0',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
