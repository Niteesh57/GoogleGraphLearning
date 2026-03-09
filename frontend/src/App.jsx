import { useState, useCallback, useRef, useEffect } from 'react';
import GraphView from './components/GraphView';
import PDFUploader from './components/PDFUploader';
import TextConceptInput from './components/TextConceptInput';
import LiveAssistant from './components/LiveAssistant';
import NodeInspector from './components/NodeInspector';
import GestureController from './components/GestureController';
import ProcessingOverlay from './components/ProcessingOverlay';
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
  const fgRef = useRef();
  const leftPanelRef = useRef();
  const [graphSize, setGraphSize] = useState({ width: 700, height: 500 });

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

  const handleAskGeminiRaw = async (audioOrNode, maybeNode) => {
    // Determine arguments (VoiceAssistant passes (blob, node), NodeInspector passes (node))
    const isBlob = audioOrNode instanceof Blob;
    const node = isBlob ? maybeNode : audioOrNode;
    const audioBlob = isBlob ? audioOrNode : null;

    if (!node) return;

    if (!audioBlob) {
      setGeminiExplanation(`Please use the Live Assistant or Voice panel to talk about ${node.id}.`);
      return;
    }
    setGeminiExplanation(`Transcribing and analyzing audio query for ${node.id}...`);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'query.webm');
      formData.append('nodeId', node.id);

      const response = await fetch('http://localhost:8000/api/explain-node-voice', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      setGeminiExplanation(data.explanation || "Gemini provided an explanation here.");
    } catch (e) {
      console.warn("Backend not connected yet or error occurred");
      setGeminiExplanation(`Error communicating with Gemini audio service.`);
    }
  };

  const handleAskGemini = async (node) => {
    console.warn("handleAskGemini called but depreciated. Please use Voice controls.");
  };


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
        <div className="left-panel" ref={leftPanelRef}>
           <GraphView 
             ref={fgRef}
             data={graphData} 
             onNodeSelect={handleNodeSelect}
             selectedNode={selectedNode}
             width={graphSize.width}
             height={graphSize.height}
           />
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
             <NodeInspector 
               selectedNode={selectedNode} 
               onAskGemini={handleAskGeminiRaw} 
             />
             {geminiExplanation && (
               <div className="gemini-response">
                 <h4>Gemini Explains:</h4>
                 <p>{geminiExplanation}</p>
               </div>
             )}
          </div>

          <div className="bottom-inputs">
             <LiveAssistant 
               graphContainerRef={leftPanelRef}
               selectedNode={selectedNode}
               graphData={graphData}
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
