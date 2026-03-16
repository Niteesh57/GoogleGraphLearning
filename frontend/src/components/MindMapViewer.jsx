import React, { useRef, useEffect, useState } from 'react';

function buildLayout(nodes) {
  // Build adjacency
  const children = {};
  const nodeMap = {};
  nodes.forEach(n => {
    nodeMap[n.id] = n;
    children[n.id] = [];
  });
  let rootId = null;
  nodes.forEach(n => {
    if (!n.parent || n.parent === '' || n.parent === 'null') {
      rootId = n.id;
    } else if (children[n.parent] !== undefined) {
      children[n.parent].push(n.id);
    }
  });
  if (!rootId) rootId = nodes[0]?.id;

  const positions = {};
  const CX = 500, CY = 380;
  positions[rootId] = { x: CX, y: CY };

  const kids = children[rootId] || [];
  // Split primary branches left and right for balance
  const rightKids = kids.slice(0, Math.ceil(kids.length / 2));
  const leftKids = kids.slice(Math.ceil(kids.length / 2));

  function placeSide(sideNodes, depth, direction, yStart, yEnd) {
    if (sideNodes.length === 0) return;
    const slice = (yEnd - yStart) / sideNodes.length;
    sideNodes.forEach((kid, i) => {
      const kidYStart = yStart + i * slice;
      const kidYEnd = yStart + (i + 1) * slice;
      
      const x = CX + direction * (180 + (depth - 1) * 180);
      const y = (kidYStart + kidYEnd) / 2;
      positions[kid] = { x, y };
      
      const subKids = children[kid] || [];
      placeSide(subKids, depth + 1, direction, kidYStart, kidYEnd);
    });
  }

  // Margin top/bottom is 60px dynamically spaced
  placeSide(rightKids, 1, 1, 60, 700);
  placeSide(leftKids, 1, -1, 60, 700);

  return { positions, rootId, children };
}

export default function MindMapViewer({ mapData, onClose }) {
  const [activeNode, setActiveNode] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slight delay so CSS transition fires
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  if (!mapData || !mapData.nodes || mapData.nodes.length === 0) return null;

  const { positions, rootId, children } = buildLayout(mapData.nodes);
  const nodeMap = {};
  mapData.nodes.forEach(n => { nodeMap[n.id] = n; });

  // Color palette per depth (Professional & Clean)
  const depthColor = (id) => {
    if (id === rootId) return { fill: '#ffffff', stroke: '#1e293b', text: '#0f172a' }; // Root: White with dark slate border
    const parent = nodeMap[id]?.parent;
    if (!parent || parent === 'null' || parent === '') return { fill: '#ffffff', stroke: '#1e293b', text: '#0f172a' };
    
    // branches
    if (children[rootId]?.includes(id)) {
      const idx = children[rootId].indexOf(id);
      const palette = [
        { fill: '#eff6ff', stroke: '#3b82f6', text: '#1e3a8a' }, // Blue
        { fill: '#f0fdf4', stroke: '#22c55e', text: '#14532d' }, // Green
        { fill: '#fef2f2', stroke: '#ef4444', text: '#7f1d1d' }, // Red
        { fill: '#fffbeb', stroke: '#f59e0b', text: '#78350f' }, // Amber
        { fill: '#faf5ff', stroke: '#a855f7', text: '#581c87' }, // Purple
        { fill: '#f0fdfa', stroke: '#14b8a6', text: '#134e4a' }, // Teal
      ];
      return palette[idx % palette.length];
    }
    
    // grandchildren inherit parent's color theme
    return depthColor(parent);
  };

  return (
    <div className="mind-map-overlay" style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#f8fafc', // Light gray/blue formal background
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      zIndex: 100,
      overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.98)',
      transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path>
            <line x1="16" y1="8" x2="2" y2="22"></line>
            <line x1="17.5" y1="15" x2="9" y2="15"></line>
          </svg>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#334155', letterSpacing: '0.3px' }}>
            {mapData.title}
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
          onMouseEnter={e => { e.target.style.background = '#f1f5f9'; e.target.style.color = '#334155'; }}
          onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = '#94a3b8'; }}
          aria-label="Close Diagram"
        >✕</button>
      </div>

      {/* SVG Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#f8fafc' }}>
        <svg
          viewBox="0 0 1000 760"
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Subtle shadow for nodes instead of glow */}
            <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* Edges */}
          {mapData.nodes.map((node, i) => {
            if (!node.parent || node.parent === '' || node.parent === 'null') return null;
            const from = positions[node.parent];
            const to = positions[node.id];
            if (!from || !to) return null;
            const theme = depthColor(node.id);
            
            // Curved cubic bezier path for elegant tree layout
            const dx = Math.abs(to.x - from.x);
            const sign = to.x > from.x ? 1 : -1;
            const d = `M ${from.x} ${from.y} C ${from.x + sign * dx * 0.5} ${from.y}, ${to.x - sign * dx * 0.5} ${to.y}, ${to.x} ${to.y}`;
            const length = 600; // rough bound for stroke dash animation

            return (
              <path
                key={`edge-${node.id}`}
                d={d}
                fill="none"
                stroke={theme.stroke}
                strokeWidth={node.parent === rootId ? 1.5 : 1}
                strokeOpacity={0.6}
                strokeDasharray={length}
                strokeDashoffset={length}
                style={{
                  animation: `lineDraw 0.6s ease-out forwards`,
                  animationDelay: `${i * 60 + 100}ms`,
                }}
              />
            );
          })}

          {/* Nodes */}
          {mapData.nodes.map((node, i) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const isRoot = node.id === rootId;
            const isBranch = children[rootId]?.includes(node.id);
            const theme = depthColor(node.id);
            const isActive = activeNode?.id === node.id;
            
            // Increased radii to fit multi-line wrapped text
            const rx = isRoot ? 48 : isBranch ? 40 : 34;

            return (
              <g
                key={node.id}
                style={{
                  cursor: node.description ? 'pointer' : 'default',
                  opacity: 0,
                  transformOrigin: `${pos.x}px ${pos.y}px`,
                  animation: `popBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                  animationDelay: `${i * 60}ms`,
                }}
                onClick={() => setActiveNode(isActive ? null : node)}
              >
                <circle
                  cx={pos.x} cy={pos.y} r={rx + (isActive ? 3 : 0)}
                  fill={theme.fill}
                  stroke={theme.stroke}
                  strokeWidth={isRoot ? 2.5 : isActive ? 2 : 1.5}
                  filter="url(#drop-shadow)"
                  style={{ transition: 'all 0.2s ease-out' }}
                />
                
                {/* Inscribed square using perfectly scaled dimensions: r * sqrt(2) */}
                <foreignObject 
                  x={pos.x - rx * 0.707} 
                  y={pos.y - rx * 0.707} 
                  width={rx * 1.414} 
                  height={rx * 1.414}
                  style={{ pointerEvents: 'none' }}
                >
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center',
                    padding: '2px',
                    boxSizing: 'border-box',
                    color: theme.text,
                    fontSize: isRoot ? '12px' : isBranch ? '11px' : '9.5px',
                    fontWeight: isRoot ? 600 : isActive ? 600 : 500,
                    lineHeight: 1.25,
                    // CSS trunkation if it still overflows slightly
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 3, 
                    wordBreak: 'break-word',
                  }}>
                    {node.label}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {/* Tooltip / description card - formal style */}
        {activeNode && activeNode.description && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16, right: 16,
            background: '#ffffff',
            border: `1px solid ${depthColor(activeNode.id).stroke}`,
            boxShadow: '0 4px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
            borderRadius: '8px', padding: '14px 18px',
            animation: 'tooltipIn 0.2s ease-out',
            color: '#334155'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: depthColor(activeNode.id).stroke,
                flexShrink: 0,
              }} />
              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                {activeNode.label}
              </span>
            </div>
            <p style={{ margin: 0, color: '#475569', fontSize: '0.8rem', lineHeight: 1.55 }}>
              {activeNode.description}
            </p>
          </div>
        )}
      </div>

      {/* Hint */}
      <div style={{
        padding: '10px 20px',
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        fontSize: '0.75rem', color: '#64748b', textAlign: 'center', flexShrink: 0,
        fontWeight: 500
      }}>
        Click any node to see its description
      </div>

      <style>{`
        @keyframes popBounce {
          0% { opacity: 0; transform: scale(0.3); }
          60% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes lineDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
