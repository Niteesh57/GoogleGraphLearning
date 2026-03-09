import React, { useEffect, useRef, forwardRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';

const BOUND = 1200;

const GraphView = forwardRef(({ data, onNodeSelect, selectedNode, width, height }, ref) => {

  // Apply ForceAtlas2-like forces once mounted
  useEffect(() => {
    const applyForces = () => {
      const fg = ref?.current;
      if (!fg) return;
      try {
        // Strong repulsion — spread nodes apart
        fg.d3Force('charge')?.strength(-350);
        // Linked nodes pulled together firmly
        fg.d3Force('link')?.distance(140).strength(0.8);
        // Keep cluster centered
        fg.d3Force('center')?.strength(0.05);
        // Collision — prevents node overlap!
        fg.d3Force('collision', forceCollide(45));
        fg.d3ReheatSimulation();
      } catch (e) { }
    };

    // Apply immediately + small delay (ref may not be ready instantly)
    applyForces();
    const t = setTimeout(applyForces, 300);
    return () => clearTimeout(t);
  }, []);

  // On data change: re-apply forces + zoom to fit
  useEffect(() => {
    const fg = ref?.current;
    if (!fg) return;

    try {
      fg.d3Force('charge')?.strength(-350);
      fg.d3Force('link')?.distance(140).strength(0.8);
      fg.d3Force('collision', forceCollide(45));
      fg.d3ReheatSimulation();
    } catch (e) { }

    const t = setTimeout(() => {
      try { fg.zoomToFit(500, 50); } catch (e) { }
    }, 800);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#f1f5f9' }}>
      <ForceGraph2D
        ref={ref}
        width={width}
        height={height}
        graphData={data}
        nodeLabel="id"
        nodeAutoColorBy="group"
        onNodeClick={onNodeSelect}
        backgroundColor="#f1f5f9"
        // ── ForceAtlas2-like physics ─────────────────────────────
        cooldownTicks={300}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.4}
        // ── Zoom bounds ──────────────────────────────────────────
        minZoom={0.2}
        maxZoom={5}
        // ── Interaction ──────────────────────────────────────────
        enableNodeDrag={true}
        enablePanInteraction={true}
        enableZoomInteraction={true}
        nodeRelSize={9}
        // ── Link visuals ─────────────────────────────────────────
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkColor={link => {
          if (!selectedNode) return 'rgba(100,116,139,0.4)';
          const sid = typeof link.source === 'object' ? link.source.id : link.source;
          const tid = typeof link.target === 'object' ? link.target.id : link.target;
          return (sid === selectedNode.id || tid === selectedNode.id)
            ? 'rgba(251,146,60,0.9)'   // orange highlight for connected links
            : 'rgba(100,116,139,0.25)';
        }}
        // ── Node rendering ───────────────────────────────────────
        nodeCanvasObject={(node, ctx, globalScale) => {
          // Hard-clamp positions so nodes never leave the bounded area
          node.x = Math.max(-BOUND, Math.min(BOUND, node.x ?? 0));
          node.y = Math.max(-BOUND, Math.min(BOUND, node.y ?? 0));

          const isSelected = selectedNode && node.id === selectedNode.id;
          const label = node.id;
          const fontSize = Math.max(9, 13 / globalScale);
          ctx.font = `${isSelected ? 600 : 400} ${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const pad = fontSize * 0.45;
          const bw = textWidth + pad * 2;
          const bh = fontSize + pad * 2;

          // Glow for selected node
          if (isSelected) {
            ctx.shadowColor = node.color || '#6366f1';
            ctx.shadowBlur = 12 / globalScale;
          }

          // Pill background
          ctx.beginPath();
          ctx.roundRect(node.x - bw / 2, node.y - bh / 2, bw, bh, bh / 2);
          ctx.fillStyle = isSelected ? (node.color || '#6366f1') : 'rgba(255,255,255,0.95)';
          ctx.fill();
          ctx.strokeStyle = node.color || '#6366f1';
          ctx.lineWidth = (isSelected ? 2.5 : 1.5) / globalScale;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Label
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isSelected ? '#ffffff' : (node.color || '#0f172a');
          ctx.fillText(label, node.x, node.y);

          node.__bckgDimensions = [bw, bh];
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          const [bw, bh] = node.__bckgDimensions || [20, 16];
          ctx.fillRect(node.x - bw / 2, node.y - bh / 2, bw, bh);
        }}
      />
    </div>
  );
});

export default GraphView;
