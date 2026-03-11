import { useState, useEffect } from 'react';

const FEATURES = [
  {
    icon: '🖐️',
    title: 'Hand Gesture Navigation',
    desc: 'Swipe through concepts with your hand — no keyboard needed.',
  },
  {
    icon: '🎙️',
    title: 'Live AI Tutor',
    desc: 'Ask Gemini questions while browsing the graph via your microphone.',
  },
  {
    icon: '🔍',
    title: 'Relationship Explorer',
    desc: 'See how every concept links to its neighbors at a glance.',
  },
  {
    icon: '📡',
    title: 'Real-Time Narration',
    desc: 'Navigate to a node and Gemini automatically explains the connection.',
  },
];

export default function ProcessingOverlay({ filename, onCancel }) {
  const [featureIdx, setFeatureIdx] = useState(0);

  // Feature carousel auto-rotates
  useEffect(() => {
    const timer = setInterval(() => setFeatureIdx(i => (i + 1) % FEATURES.length), 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="processing-overlay">
      <div className="processing-content">
        <div className="processing-loader-wrapper">
          <div className="simple-spinner"></div>
        </div>

        <h2 className="processing-title">{filename || 'Processing...'}</h2>
        <p className="processing-subtitle">Please wait while the AI completes this task.</p>

        {/* Feature carousel */}
        <div className="processing-feature-card">
          <div className="feature-icon">{FEATURES[featureIdx].icon}</div>
          <div>
            <div className="feature-title">{FEATURES[featureIdx].title}</div>
            <div className="feature-desc">{FEATURES[featureIdx].desc}</div>
          </div>
        </div>
        
        <div className="feature-dots">
          {FEATURES.map((_, i) => (
            <span key={i} className={`dot ${i === featureIdx ? 'active' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
