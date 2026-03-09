export default function NodeInspector({ selectedNode, onAskGemini }) {
  if (!selectedNode) {
    return (
      <div className="inspector-panel empty">
        <p>No node selected.</p>
        <p>Select a node in the graph below to inspect.</p>
      </div>
    );
  }

  return (
    <div className="inspector-panel active">
      <div className="inspector-header">
        <h3>{selectedNode.id}</h3>
        {selectedNode.group && <span className="badge">Group {selectedNode.group}</span>}
      </div>
      <div className="inspector-body">
        <p>You can ask Gemini to explain this concept and its relationships within the Knowledge Graph.</p>
        <button onClick={() => onAskGemini(selectedNode)} className="action-btn">
          Ask Gemini about {selectedNode.id}
        </button>
      </div>
    </div>
  );
}
