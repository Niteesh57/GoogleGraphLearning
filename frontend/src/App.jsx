import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import GraphView from './components/GraphView';
import PDFUploader from './components/PDFUploader';
import TextConceptInput from './components/TextConceptInput';
import LiveAssistant from './components/LiveAssistant';
import GestureController from './components/GestureController';
import ProcessingOverlay from './components/ProcessingOverlay';
import MindMapViewer from './components/MindMapViewer';
import './index.css';

// Mock data to ensure react-force-graph renders correctly
const initialData = {
  nodes: [
    { id: 'Neural Networks', group: 1 },
    { id: 'Backpropagation', group: 2 },
    { id: 'Gradient Descent', group: 2 },
    { id: 'CNN', group: 3 },
    { id: 'Convolutional Layer', group: 3 },
  ],
  links: [
    { source: 'Neural Networks', target: 'Backpropagation', label: 'trained using' },
    { source: 'Backpropagation', target: 'Gradient Descent', label: 'optimized by' },
    { source: 'CNN', target: 'Convolutional Layer', label: 'uses' },
    { source: 'Neural Networks', target: 'CNN', label: 'type of' }
  ]
};

function App() {
  const [graphData, setGraphData] = useState(initialData);
  const [selectedNode, setSelectedNode] = useState(null);
  const [geminiExplanation, setGeminiExplanation] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFile, setProcessingFile] = useState(null);
  const [mindMapData, setMindMapData] = useState(null);
  const [mindMapHistory, setMindMapHistory] = useState([]);
  
  const fgRef = useRef();
  const leftPanelRef = useRef();
  const geminiTextEndRef = useRef(null);
  const [graphSize, setGraphSize] = useState({ width: 700, height: 500 });

  // Auto-scroll Gemini explanation when new text arrives
  useEffect(() => {
    if (geminiTextEndRef.current) {
      geminiTextEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [geminiExplanation]);

  // Measure left panel and keep graph canvas sized to fill it exactly
  useEffect(() => {
    if (!leftPanelRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setGraphSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(leftPanelRef.current);
    return () => ro.disconnect();
  }, []);

  const handleNodeSelect = useCallback(node => {
     setSelectedNode(node);
     setGeminiExplanation(""); // Reset explanation when entirely new node happens

     // Smoothly re-center graph on the selected node
     if (fgRef.current && node.x != null && node.y != null) {
       fgRef.current.centerAt(node.x, node.y, 600); // 600ms transition
       fgRef.current.zoom(1.5, 600);
     }
  }, []);

  // ── DIRECTIONAL NODE NAVIGATION (Arrows + Swipe) ─────────────────────────
  const navigateDirection = useCallback((direction) => {
    if (!selectedNode || !graphData || !graphData.nodes.length) return;
    
    // Find immediate neighbors of the current selected node
    const neighbors = new Set();
    graphData.links.forEach(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === selectedNode.id) neighbors.add(tid);
      if (tid === selectedNode.id) neighbors.add(sid);
    });

    let bestNode = null;
    let bestScore = Infinity; // We want lowest score (angle match)

    let targetAngle = 0;
    if (direction === "RIGHT") targetAngle = 0;
    else if (direction === "DOWN") targetAngle = Math.PI / 2;
    // Math.atan2 can return PI or -PI for exactly left
    else if (direction === "LEFT") targetAngle = Math.PI; 
    else if (direction === "UP") targetAngle = -Math.PI / 2;

    graphData.nodes.forEach(n => {
      // Only allow moving to immediate neighbors!
      if (n.id === selectedNode.id || !neighbors.has(n.id) || n.x == null || n.y == null) return;

      const nx = n.x - selectedNode.x;
      const ny = n.y - selectedNode.y;
      const nAngle = Math.atan2(ny, nx);
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Angular difference between ideal swipe and node position
      let angleDiff = Math.abs(nAngle - targetAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      // Only consider nodes roughly in the same quadrant (±45 degrees)
      if (angleDiff < Math.PI / 3) {
        const score = dist * (1 + angleDiff * 2);
        if (score < bestScore) {
          bestScore = score;
          bestNode = n;
        }
      }
    });

    if (bestNode) {
      handleNodeSelect(bestNode);
    }
  }, [graphData, selectedNode, handleNodeSelect]);

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      
      if (e.key === 'ArrowRight') navigateDirection("RIGHT");
      else if (e.key === 'ArrowLeft') navigateDirection("LEFT");
      else if (e.key === 'ArrowUp') navigateDirection("UP");
      else if (e.key === 'ArrowDown') navigateDirection("DOWN");
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateDirection]);

  const refreshGraph = useCallback(() => {
    fetch('http://localhost:8000/api/graph-state')
      .then(res => res.json())
      .then(data => {
        setGraphData(data);
        // On initial data load, auto-select the first node to give the user a starting anchor
        if (data && data.nodes && data.nodes.length > 0 && !selectedNode) {
          handleNodeSelect(data.nodes[0]);
        }
      })
      .catch(err => console.error("Could not fetch graph data", err));
  }, [selectedNode, handleNodeSelect]);


  return (
    <div className="app-layout">
      
      {/* Processing overlay — shown during PDF upload */}
      {isProcessing && (
        <ProcessingOverlay
          filename={processingFile}
          onCancel={() => { setIsProcessing(false); setProcessingFile(null); }}
        />
      )}

      <header className="app-header">
        <h1>Live AI Knowledge Graph Explorer</h1>
      </header>
      
      <div className="main-content">
        <div className="left-panel" ref={leftPanelRef} style={{ position: 'relative' }}>
           <GraphView 
             ref={fgRef}
             data={graphData} 
             onNodeSelect={handleNodeSelect}
             selectedNode={selectedNode}
             width={graphSize.width}
             height={graphSize.height}
           />
           {/* Mind map overlay — rendered on top of the 3D graph */}
           {mindMapData && (
             <MindMapViewer
               mapData={mindMapData}
               onClose={() => setMindMapData(null)}
             />
           )}
        </div>

        <div className="right-panel">
          <div className="top-inputs">
             <PDFUploader 
               onConceptsExtracted={refreshGraph}
               onProcessingChange={(active, name) => {
                 setIsProcessing(active);
                 setProcessingFile(name);
               }}
             />
             <TextConceptInput onConceptsExtracted={refreshGraph} />
             <GestureController
               onSwipe={navigateDirection}
             />
          </div>

          <div className="middle-inspector">
             {/* Gemini Explanation box with auto-scroll */}
             <div className="gemini-response" style={{ maxHeight: '200px', overflowY: 'auto' }}>
               {geminiExplanation ? (
                 <>
                   <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Gemini Explains:</h4>
                   <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#e2e8f0', wordBreak: 'break-word', paddingRight: '8px' }}>
                     <ReactMarkdown>{geminiExplanation}</ReactMarkdown>
                   </div>
                   <div ref={geminiTextEndRef} />
                 </>
               ) : (
                 <p style={{ margin: 0, color: '#64748b', fontStyle: 'italic', fontSize: '0.9rem' }}>
                   Ask Gemini about a concept to see the explanation here...
                 </p>
               )}
             </div>

             {/* Mind Map History */}
             {mindMapHistory.length > 0 && (
               <div className="mind-map-history" style={{ 
                 marginTop: '1rem', padding: '12px', background: 'rgba(255,255,255,0.03)', 
                 borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'
               }}>
                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mind Map History</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                   {mindMapHistory.map((map, idx) => (
                     <button
                       key={idx}
                       onClick={() => setMindMapData(map)}
                       style={{
                         background: 'transparent', border: '1px solid #475569',
                         color: '#e2e8f0', padding: '8px 12px', borderRadius: '6px',
                         textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem',
                         transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px'
                       }}
                       onMouseEnter={e => {
                         e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                         e.currentTarget.style.borderColor = '#64748b';
                       }}
                       onMouseLeave={e => {
                         e.currentTarget.style.background = 'transparent';
                         e.currentTarget.style.borderColor = '#475569';
                       }}
                     >
                       <span style={{ fontSize: '1rem', opacity: 0.8 }}>📄</span>
                       <span>{map.title}</span>
                     </button>
                   ))}
                 </div>
               </div>
             )}
          </div>

          <div className="bottom-inputs">
             <LiveAssistant 
               graphContainerRef={leftPanelRef}
               selectedNode={selectedNode}
               graphData={graphData}
               onMindMapReceived={(data) => {
                 setMindMapData(data);
                 setMindMapHistory(prev => [data, ...prev]);
               }}
               onAudioFinished={() => {
                  console.log("Audio finished! Auto-closing mind map in 1.5s...");
                  // Keep it on screen for 1.5 seconds after speaking finishes before closing
                  setTimeout(() => setMindMapData(null), 1500);
               }}
               onTextReceived={(text) => {
                 setGeminiExplanation(prev => {
                   if (!prev || prev.includes("Transcribing")) return text;
                   return prev + " " + text;
                 });
               }}
             />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
