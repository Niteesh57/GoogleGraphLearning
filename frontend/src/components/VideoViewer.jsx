import React, { useEffect, useState, useRef } from 'react';

export default function VideoViewer({ videoData, onClose, onVideoPlay, onVideoPause, id = "active-video-player" }) {
  const [visible, setVisible] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    // Delay slightly to trigger CSS transition
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    // Signal pause before closing so narration stops
    onVideoPause?.();
    setTimeout(onClose, 250); // wait for fade out
  };

  if (!videoData || !videoData.url) return null;

  return (
    <div className="video-overlay" style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#0f172a',
      borderRadius: '12px',
      border: '1px solid #1e293b',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      zIndex: 100,
      overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.98)',
      transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#1e293b',
        borderBottom: '1px solid #0f172a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.1rem' }}>🎬</span>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.3px' }}>
            {videoData.title}
          </h2>
        </div>
        <button onClick={handleClose} style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8', fontSize: '18px',
          width: 28, height: 28, borderRadius: '4px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.color = '#fff'; }}
          onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = '#94a3b8'; }}
          aria-label="Close Video"
        >✕</button>
      </div>

      {/* Video Content */}
      <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video 
          ref={videoRef}
          id={id}
          src={videoData.url} 
          autoPlay 
          controls 
          playsInline
          crossOrigin="anonymous"
          onPlay={() => onVideoPlay?.(videoData.title)}
          onPause={() => onVideoPause?.()}
          onEnded={() => {
            onVideoPause?.();
            handleClose();
          }}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}
