import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import * as api from '../api';
import TopBar from './TopBar';
import Toolbar from './Toolbar';
import AnnotationCanvas from './AnnotationCanvas';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import DashboardPanel from './DashboardPanel';
import ReviewPanel from './ReviewPanel';

export default function ProjectView() {
  const { projectId } = useParams();
  const currentProject = useStore((s) => s.currentProject);
  const setCurrentProject = useStore((s) => s.setCurrentProject);
  const setImages = useStore((s) => s.setImages);
  const setLabelClasses = useStore((s) => s.setLabelClasses);
  const setActiveLabel = useStore((s) => s.setActiveLabel);
  const setAnnotations = useStore((s) => s.setAnnotations);
  const setCurrentImage = useStore((s) => s.setCurrentImage);
  const images = useStore((s) => s.images);
  const currentImage = useStore((s) => s.currentImage);

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const { subscribeToImage } = useWebSocket();

  // Load project data on mount or when projectId changes
  useEffect(() => {
    async function loadProject() {
      if (!projectId) return;
      setLoading(true);
      try {
        const project = await api.fetchProject(projectId);
        setCurrentProject(project);

        const [imgs, labels] = await Promise.all([
          api.fetchImages(projectId),
          api.fetchLabels(projectId),
        ]);

        setImages(imgs);
        setLabelClasses(labels);

        if (labels.length > 0) {
          setActiveLabel(labels[0]);
        }

        // Select first image if none selected
        if (imgs.length > 0 && !currentImage) {
          setCurrentImage(imgs[0]);
        }
      } catch (err) {
        console.error('Failed to load project:', err);
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  // Load annotations when current image changes
  useEffect(() => {
    async function loadAnnotations() {
      if (!currentImage) {
        setAnnotations([]);
        return;
      }
      try {
        const anns = await api.fetchAnnotations(currentImage.id);
        setAnnotations(anns);
        subscribeToImage(currentImage.id);
      } catch (err) {
        console.error('Failed to load annotations:', err);
      }
    }

    loadAnnotations();
  }, [currentImage?.id]);

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: 14,
        }}
      >
        Loading project...
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      <TopBar
        onOpenDashboard={() => setDashboardOpen(true)}
        onOpenReview={() => setReviewOpen(true)}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AnnotationCanvas />
          <ChatPanel />
        </div>

        <Sidebar />
      </div>

      <DashboardPanel
        isOpen={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
      />

      <ReviewPanel
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </div>
  );
}
