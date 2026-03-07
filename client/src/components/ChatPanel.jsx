import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import * as api from '../api';

export default function ChatPanel({ uiScale = 1 }) {
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef(null);
  const resizeStartRef = useRef(null);
  const panelRef = useRef(null);

  const currentImage = useStore((s) => s.currentImage);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const chatMessages = useStore((s) => s.chatMessages);
  const currentProject = useStore((s) => s.currentProject);
  const activeLabel = useStore((s) => s.activeLabel);
  const chatHistory = useStore((s) => s.chatHistory);
  const setChatHistory = useStore((s) => s.setChatHistory);
  const setAnnotations = useStore((s) => s.setAnnotations);
  const setAiResults = useStore((s) => s.setAiResults);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!isResizing) return;

    function handleMouseMove(e) {
      if (resizeStartRef.current != null) {
        const delta = resizeStartRef.current - e.clientY;
        setPanelHeight((h) => Math.max(120, Math.min(600, h + delta)));
        resizeStartRef.current = e.clientY;
      }
    }

    function handleMouseUp() {
      setIsResizing(false);
      resizeStartRef.current = null;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  async function handleSend() {
    const command = input.trim();
    if (!command || !currentImage) return;

    setInput('');

    addChatMessage({
      id: Date.now(),
      role: 'user',
      text: command,
      timestamp: new Date().toISOString(),
    });

    addChatMessage({
      id: Date.now() + 1,
      role: 'system',
      text: 'Processing...',
      isLoading: true,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await api.agentChat(
        currentImage.id,
        command,
        currentProject?.id,
        chatHistory,
      );

      const resultAnnotations = result.annotations || [];
      const message = result.message || `Found ${resultAnnotations.length} result(s)`;

      // Update conversation history for multi-turn
      if (result.history) {
        setChatHistory(result.history);
      }

      // If there were DB actions (remove/relabel), refresh annotations
      if (result.actions && result.actions.length > 0) {
        try {
          const fresh = await api.fetchAnnotations(currentImage.id);
          setAnnotations(fresh);
        } catch {
          // ignore refresh errors
        }
      }

      // Push annotation candidates to canvas as AI suggestions (same UX as segment everything)
      if (resultAnnotations.length > 0) {
        const suggestions = resultAnnotations.map((ann) => ({
          data: ann.polygon,
          polygon: ann.polygon,
          score: ann.confidence ?? null,
          bbox: ann.bbox,
          rle: ann.rle,
          label: ann.label || activeLabel?.name || null,
          source: 'nl-agent',
          type: 'polygon',
        }));
        setAiResults(suggestions);
      }

      // Remove the loading message by adding a completed one
      addChatMessage({
        id: Date.now() + 2,
        role: 'assistant',
        text: message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      addChatMessage({
        id: Date.now() + 2,
        role: 'assistant',
        text: `Error: ${err.message}`,
        isError: true,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 20px',
          background: '#4a9eff',
          color: '#fff',
          border: 'none',
          borderRadius: 20,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          zIndex: 100,
        }}
      >
        Chat Assistant
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        height: panelHeight,
        background: '#1e1e1e',
        borderTop: '1px solid #3d3d3d',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zoom: uiScale,
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={(e) => {
          setIsResizing(true);
          resizeStartRef.current = e.clientY;
        }}
        style={{
          height: 4,
          background: 'transparent',
          cursor: 'ns-resize',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a9eff')}
        onMouseLeave={(e) => {
          if (!isResizing) e.currentTarget.style.background = 'transparent';
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          background: '#2a2a2a',
          borderBottom: '1px solid #3d3d3d',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#ccc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Chat Assistant
        </span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {chatMessages.length === 0 && (
          <div style={{ color: '#666', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            Try commands like: "find all cars", "label dogs in this image", "count objects"
          </div>
        )}

        {chatMessages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'flex-end',
                  background: '#4a9eff',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '12px 12px 2px 12px',
                  fontSize: 13,
                  maxWidth: '80%',
                  wordBreak: 'break-word',
                }}
              >
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'system') {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'center',
                  color: msg.isLoading ? '#4a9eff' : '#888',
                  fontSize: 11,
                  fontStyle: 'italic',
                }}
              >
                {msg.isLoading && (
                  <span style={{ marginRight: 6 }}>...</span>
                )}
                {msg.text}
              </div>
            );
          }

          // Assistant messages
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: 'flex-start',
                maxWidth: '85%',
              }}
            >
              <div
                style={{
                  background: msg.isError ? '#ff4a4a22' : '#2d2d2d',
                  color: msg.isError ? '#ff4a4a' : '#e0e0e0',
                  padding: '6px 12px',
                  borderRadius: '12px 12px 12px 2px',
                  fontSize: 13,
                  wordBreak: 'break-word',
                  border: msg.isError ? '1px solid #ff4a4a44' : 'none',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid #3d3d3d',
          flexShrink: 0,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={currentImage ? 'e.g. "find all cars", "label dogs"...' : 'Select an image first'}
          disabled={!currentImage}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#2d2d2d',
            border: '1px solid #3d3d3d',
            borderRadius: 6,
            color: '#e0e0e0',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !currentImage}
          style={{
            padding: '8px 16px',
            background: input.trim() && currentImage ? '#4a9eff' : '#3d3d3d',
            color: input.trim() && currentImage ? '#fff' : '#666',
            border: 'none',
            borderRadius: 6,
            cursor: input.trim() && currentImage ? 'pointer' : 'default',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
