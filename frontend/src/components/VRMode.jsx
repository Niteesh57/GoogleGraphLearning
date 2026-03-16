import React, { useRef, useEffect } from 'react';
import GraphView from './GraphView';
import GestureController from './GestureController';
import MindMapViewer from './MindMapViewer';
import VideoViewer from './VideoViewer';
import MenuViewer from './MenuViewer';
import IsolatedSection from './IsolatedSection';

/**
 * VRMode — generic split-screen for any VR box (Cardboard etc.)
 * Two identical 50vw panes side-by-side, fullscreen, landscape.
 * Renders the same GraphView + camera feed in each eye.
 * FIXED: Now renders two independent GraphView instances to ensure alignment.
 */
export default function VRMode({ 
  graphData, selectedNode, onNodeSelect, graphSize, cameraSlot, onSwipe,
  mindMapData, setMindMapData,
  videoData, setVideoData, onVideoPlay, onVideoPause,
  menuData, setMenuData,
  isolatedSectionData, setIsolatedSectionData,
  cameraRef, fgRef
}) {
  const fgRefRight = useRef();

  // Keep both graphs centered on the same node in sync
  useEffect(() => {
    if (!selectedNode || selectedNode.x == null || selectedNode.y == null) return;

    const centerGraphs = () => {
      // Primary ref (Left Eye)
      if (fgRef?.current) {
        fgRef.current.centerAt(selectedNode.x, selectedNode.y, 600);
        fgRef.current.zoom(1.0, 600);
      }
      // Secondary ref (Right Eye)
      if (fgRefRight.current) {
        fgRefRight.current.centerAt(selectedNode.x, selectedNode.y, 600);
        fgRefRight.current.zoom(1.0, 600);
      }
    };

    centerGraphs();
  }, [selectedNode, fgRef]);

  const renderOverlays = (isPrimary) => (
    <div className="vr-overlay-container" style={{
      position: 'absolute',
      inset: '10%', // Center and scale down slightly for VR focus
      zIndex: 100,
      pointerEvents: (mindMapData || menuData || isolatedSectionData || videoData) ? 'auto' : 'none'
    }}>
      {mindMapData && (
        <MindMapViewer
          mapData={mindMapData}
          onClose={() => setMindMapData(null)}
        />
      )}
      {menuData && (
        <MenuViewer
          menuData={menuData}
          onClose={() => setMenuData(null)}
        />
      )}
      {isolatedSectionData && (
        <IsolatedSection
          sectionData={isolatedSectionData}
          onClose={() => setIsolatedSectionData(null)}
        />
      )}
      {videoData && (
        <VideoViewer
          videoData={videoData}
          id={isPrimary ? "active-video-player" : "secondary-video-player"}
          onVideoPlay={onVideoPlay}
          onVideoPause={onVideoPause}
          onClose={() => setVideoData(null)}
        />
      )}
    </div>
  );

  const halfWidth = graphSize.width / 2;

  return (
    <div className="vr-root" style={{ background: '#000', overflow: 'hidden' }}>
      {/* Hidden gesture controller to capture hands and trigger onSwipe navigation */}
      <div style={{ display: 'none' }}>
         <GestureController isActive={true} onSwipe={onSwipe} sharedCamera={cameraRef} />
      </div>

      {/* Left eye overlay layer */}
      <div className="vr-eye vr-eye-left" style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', overflow: 'hidden' }}>
        <GraphView
          ref={fgRef}
          data={graphData}
          selectedNode={selectedNode}
          onNodeSelect={onNodeSelect}
          width={halfWidth}
          height={graphSize.height}
        />
        {cameraSlot && <div className="vr-camera-overlay" style={{ zIndex: 10, pointerEvents: 'auto' }}>{cameraSlot}</div>}
        {renderOverlays(true)}
      </div>

      {/* Divider */}
      <div className="vr-divider" style={{ 
        position: 'absolute', left: '50%', top: 0, bottom: 0, 
        width: '4px', background: '#111', zIndex: 10, transform: 'translateX(-50%)' 
      }} />

      {/* Right eye overlay layer (identical) */}
      <div className="vr-eye vr-eye-right" style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%', overflow: 'hidden' }}>
        <GraphView
          ref={fgRefRight}
          data={graphData}
          selectedNode={selectedNode}
          onNodeSelect={onNodeSelect}
          width={halfWidth}
          height={graphSize.height}
        />
        {cameraSlot && <div className="vr-camera-overlay" style={{ zIndex: 10, pointerEvents: 'auto' }}>{cameraSlot}</div>}
        {renderOverlays(false)}
      </div>
    </div>
  );
}
