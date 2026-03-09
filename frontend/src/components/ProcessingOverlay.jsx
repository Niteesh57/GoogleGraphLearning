import { useState, useEffect, useRef } from 'react';

const STAGES = [
  { icon: '📄', label: 'Reading PDF text', duration: 4000 },
  { icon: '🧠', label: 'Extracting key concepts with Gemini AI', duration: 8000 },
  { icon: '🔗', label: 'Mapping concept relationships', duration: 6000 },
  { icon: '🌐', label: 'Building Knowledge Graph', duration: 5000 },
  { icon: '✨', label: 'Finalizing graph structure', duration: 99999 }, // stays until complete
];

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

// Animated graph nodes that orbit during loading
function AnimatedGraph() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    let t = 0;

    const nodes = [
      { label: 'Transformer', r: 0, angle: 0, orbit: 0, size: 10, color: '#a78bfa' },
      { label: 'Attention',   r: 80, angle: 0,           orbit: 80,  size: 7, color: '#60a5fa' },
      { label: 'Encoder',     r: 80, angle: Math.PI*2/3, orbit: 80,  size: 7, color: '#34d399' },
      { label: 'Decoder',     r: 80, angle: Math.PI*4/3, orbit: 80,  size: 7, color: '#f59e0b' },
      { label: 'Embedding',   r: 150, angle: 0.5,        orbit: 150, size: 5, color: '#f472b6' },
      { label: 'Softmax',     r: 150, angle: 2.0,        orbit: 150, size: 5, color: '#38bdf8' },
      { label: 'MLP',         r: 150, angle: 3.7,        orbit: 150, size: 5, color: '#a3e635' },
      { label: 'LayerNorm',   r: 150, angle: 5.1,        orbit: 150, size: 5, color: '#fb923c' },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.008;

      // Calculate positions
      const positions = nodes.map((n, i) => {
        const angle = n.angle + t * (i % 2 === 0 ? 0.4 : -0.3);
        return {
          ...n,
          x: cx + n.orbit * Math.cos(angle),
          y: cy + n.orbit * Math.sin(angle),
        };
      });

      // Draw links from center to each satellite
      positions.slice(1).forEach(n => {
        const grad = ctx.createLinearGradient(positions[0].x, positions[0].y, n.x, n.y);
        grad.addColorStop(0, positions[0].color + '99');
        grad.addColorStop(1, n.color + '33');
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.moveTo(positions[0].x, positions[0].y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      });

      // Draw cross-links between outer nodes
      [[1,2],[2,3],[3,1],[4,5],[6,7]].forEach(([a,b]) => {
        const na = positions[a], nb = positions[b];
        if (!na || !nb) return;
        ctx.beginPath();
        ctx.strokeStyle = na.color + '22';
        ctx.lineWidth = 0.5;
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
      });

      // Draw nodes
      positions.forEach((n) => {
        const pulse = n.orbit === 0 ? 2 * Math.sin(t * 3) : 0;

        // Glow
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, (n.size + 4 + pulse) * 2);
        grd.addColorStop(0, n.color + '55');
        grd.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.fillStyle = grd;
        ctx.arc(n.x, n.y, (n.size + 4 + pulse) * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core circle
        ctx.beginPath();
        ctx.fillStyle = n.color;
        ctx.arc(n.x, n.y, n.size + pulse, 0, Math.PI * 2);
        ctx.fill();

        // Label
        if (n.orbit > 0) {
          ctx.fillStyle = '#e2e8f0cc';
          ctx.font = `${n.size - 1}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y - n.size - 4);
        } else {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + 3);
        }
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} width={400} height={400} style={{ opacity: 0.85 }} />;
}

export default function ProcessingOverlay({ filename, onCancel }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [featureIdx, setFeatureIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Advance stages on a timer
  useEffect(() => {
    if (stageIdx >= STAGES.length - 1) return;
    const timer = setTimeout(() => setStageIdx(i => i + 1), STAGES[stageIdx].duration);
    return () => clearTimeout(timer);
  }, [stageIdx]);

  // Feature carousel auto-rotates
  useEffect(() => {
    const timer = setInterval(() => setFeatureIdx(i => (i + 1) % FEATURES.length), 3500);
    return () => clearInterval(timer);
  }, []);

  // Elapsed time display
  useEffect(() => {
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const progress = Math.min(((stageIdx) / (STAGES.length - 1)) * 100, 95);

  return (
    <div className="processing-overlay">
      <div className="processing-content">

        {/* Left — Graph animation */}
        <div className="processing-graph-side">
          <AnimatedGraph />
          <p className="processing-graph-caption">Building your Knowledge Graph…</p>
        </div>

        {/* Right — Info */}
        <div className="processing-info-side">
          <div className="processing-header">
            <span className="processing-badge">⚙️ AI Processing</span>
            <span className="processing-timer">{formatTime(elapsed)}</span>
          </div>

          <h2 className="processing-title">Analysing <em>{filename || 'document'}</em></h2>

          {/* Progress bar */}
          <div className="processing-bar-track">
            <div className="processing-bar-fill" style={{ width: `${progress}%` }} />
          </div>

          {/* Stages */}
          <div className="processing-stages">
            {STAGES.map((s, i) => (
              <div
                key={i}
                className={`processing-stage ${
                  i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending'
                }`}
              >
                <span className="stage-icon">
                  {i < stageIdx ? '✅' : i === stageIdx ? s.icon : '○'}
                </span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

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

          <p className="processing-hint">⏳ This usually takes 2–5 minutes depending on document length.</p>
        </div>
      </div>
    </div>
  );
}
