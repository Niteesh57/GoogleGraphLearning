import GraphView from './GraphView';

/**
 * VRMode — generic split-screen for any VR box (Cardboard etc.)
 * Two identical 50vw panes side-by-side, fullscreen, landscape.
 * Renders the same GraphView + camera feed in each eye.
 */
export default function VRMode({ graphData, selectedNode, onNodeSelect, graphSize, cameraSlot }) {
  return (
    <div className="vr-root">
      {/* Left eye */}
      <div className="vr-eye vr-eye-left">
        <GraphView
          data={graphData}
          selectedNode={selectedNode}
          onNodeSelect={onNodeSelect}
          width={graphSize.width / 2}
          height={graphSize.height}
        />
        {cameraSlot && <div className="vr-camera-overlay">{cameraSlot}</div>}
      </div>

      {/* Divider */}
      <div className="vr-divider" />

      {/* Right eye (identical) */}
      <div className="vr-eye vr-eye-right">
        <GraphView
          data={graphData}
          selectedNode={selectedNode}
          onNodeSelect={onNodeSelect}
          width={graphSize.width / 2}
          height={graphSize.height}
        />
        {cameraSlot && <div className="vr-camera-overlay">{cameraSlot}</div>}
      </div>
    </div>
  );
}
