import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import GraphView from './components/GraphView';
import PDFUploader from './components/PDFUploader';
import TextConceptInput from './components/TextConceptInput';
import LiveAssistant from './components/LiveAssistant';
import GestureController from './components/GestureController';
import ProcessingOverlay from './components/ProcessingOverlay';
import MindMapViewer from './components/MindMapViewer';
import VideoViewer from './components/VideoViewer';
import CameraCapture from './components/CameraCapture';
import MenuViewer from './components/MenuViewer';
import IsolatedSection from './components/IsolatedSection';
import VRMode from './components/VRMode';
import PermissionsModal from './components/PermissionsModal';
import { isMobileDevice } from './utils/device';
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
  const [videoData, setVideoData] = useState(null);
  const [videoHistory, setVideoHistory] = useState([]);
  const [menuData, setMenuData] = useState(null);
  const [isolatedSectionData, setIsolatedSectionData] = useState(null);
  // viewMode: 'desktop' | 'mobile' | 'vr'
  const [viewMode, setViewMode] = useState(isMobileDevice() ? 'mobile' : 'desktop');
  const [cameraActive, setCameraActive] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [hasGrantedPermissions, setHasGrantedPermissions] = useState(false);
  const [isGestureActive, setIsGestureActive] = useState(false);

  const fgRef = useRef();
  const leftPanelRef = useRef();
  const geminiTextEndRef = useRef(null);
  const liveAssistantRef = useRef(null);
  const cameraRef = useRef(null);   // ref into CameraCapture for frame grab
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

  // VR Specific Sizing: Ensure it takes full window even if leftPanel is hidden/covered
  useEffect(() => {
    if (viewMode !== 'vr') return;
    const handleResize = () => {
       setGraphSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize(); // immediate
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  // Enable camera when switching to mobile/vr
  useEffect(() => {
    const isMobileOrVR = viewMode === 'mobile' || viewMode === 'vr';
    setCameraActive(isMobileOrVR && hasGrantedPermissions);
    
    if (isMobileOrVR && !hasGrantedPermissions) {
      setShowPermissionsModal(true);
    }

    // Mobile/VR mode refinements:
    if (isMobileOrVR) {
      // 2. Enable gestures by default in Mobile mode (for hand-free navigation)
      if (viewMode === 'mobile') {
        setIsGestureActive(true);
      }
    }
  }, [viewMode, hasGrantedPermissions]);

  const handleNodeSelect = useCallback(node => {
     setSelectedNode(node);
     setGeminiExplanation(""); // Reset explanation when entirely new node happens

     // Smoothly re-center graph on the selected node
     if (fgRef.current && node.x != null && node.y != null) {
       fgRef.current.centerAt(node.x, node.y, 600); // 600ms transition
       fgRef.current.zoom(viewMode === 'vr' ? 1.0 : 1.5, 600);
     }
  }, []);

  const navigateDirection = useCallback((direction) => {
    if (!selectedNode || !graphData || !graphData.nodes.length) return;
    
    const neighbors = new Set();
    graphData.links.forEach(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === selectedNode.id) neighbors.add(tid);
      if (tid === selectedNode.id) neighbors.add(sid);
    });

    let bestNode = null;
    let bestScore = Infinity;

    let targetAngle = 0;
    if (direction === "RIGHT") targetAngle = 0;
    else if (direction === "DOWN") targetAngle = Math.PI / 2;
    else if (direction === "LEFT") targetAngle = Math.PI; 
    else if (direction === "UP") targetAngle = -Math.PI / 2;

    graphData.nodes.forEach(n => {
      if (n.id === selectedNode.id || !neighbors.has(n.id) || n.x == null || n.y == null) return;

      const nx = n.x - selectedNode.x;
      const ny = n.y - selectedNode.y;
      const nAngle = Math.atan2(ny, nx);
      const dist = Math.sqrt(nx * nx + ny * ny);

      let angleDiff = Math.abs(nAngle - targetAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

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

  useEffect(() => {
    const handleKeyDown = (e) => {
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
    fetch(`${import.meta.env.VITE_API_URL}/api/graph-state`)
      .then(res => res.json())
      .then(data => {
        setGraphData(data);
        if (data && data.nodes && data.nodes.length > 0 && !selectedNode) {
          handleNodeSelect(data.nodes[0]);
        }
      })
      .catch(err => console.error("Could not fetch graph data", err));
  }, [selectedNode, handleNodeSelect]);

  const handleMindMapReceived = useCallback((data) => {
    if (data.mode === 'append') {
      setGraphData(prev => {
        const existingIds = new Set(prev.nodes.map(n => n.id));
        const newNodes = (data.nodes || []).filter(n => !existingIds.has(n.id));
        const existingLinkKeys = new Set(
          prev.links.map(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return `${s}->${t}`;
          })
        );
        const newLinks = (data.links || []).filter(l => {
          return !existingLinkKeys.has(`${l.source}->${l.target}`);
        });
        return { nodes: [...prev.nodes, ...newNodes], links: [...prev.links, ...newLinks] };
      });
    } else {
      setMindMapData(data);
    }
    setMindMapHistory(prev => [data, ...prev]);
  }, []);

  return (
    <div className="app-layout" data-view={viewMode}>

      <PermissionsModal 
        isOpen={showPermissionsModal} 
        onClose={() => setShowPermissionsModal(false)}
        onGranted={() => {
          setHasGrantedPermissions(true);
          setShowPermissionsModal(false);
        }}
      />

      {viewMode === 'vr' && (
        <>
          <button className="vr-exit-btn" onClick={() => setViewMode('desktop')}>✕ Exit VR</button>
          <VRMode
            graphData={graphData}
            selectedNode={selectedNode}
            onNodeSelect={handleNodeSelect}
            graphSize={graphSize}
            cameraRef={cameraRef}
            cameraSlot={<CameraCapture ref={cameraRef} visible />}
            onSwipe={navigateDirection}
            mindMapData={mindMapData}
            setMindMapData={setMindMapData}
            videoData={videoData}
            setVideoData={setVideoData}
            onVideoPlay={(title) => liveAssistantRef.current?.notifyVideoPlaying(title, videoData?.solution_steps)}
            onVideoPause={() => liveAssistantRef.current?.notifyVideoPaused()}
            menuData={menuData}
            setMenuData={setMenuData}
            isolatedSectionData={isolatedSectionData}
            setIsolatedSectionData={setIsolatedSectionData}
            fgRef={fgRef}
          />
        </>
      )}

      {isProcessing && (
        <ProcessingOverlay
          filename={processingFile}
          onCancel={() => { setIsProcessing(false); setProcessingFile(null); }}
        />
      )}

      <header className="app-header" style={{ display: 'flex', alignItems: 'center' }}>
        <h1>NeuroGraph LIVE</h1>
        <div className="view-mode-bar">
          {['desktop', 'mobile', 'vr'].map(mode => (
            <button
              key={mode}
              className={`view-mode-btn${viewMode === mode ? ' active' : ''}`}
              onClick={async () => {
                if (mode === 'vr') {
                   try {
                     if (!document.fullscreenElement) {
                       await document.documentElement.requestFullscreen();
                     }
                   } catch (e) {
                      console.warn("Fullscreen request failed", e);
                   }
                } else if (document.fullscreenElement) {
                   try { await document.exitFullscreen(); } catch (e) {}
                }
                setViewMode(mode);
              }}
            >
              {mode === 'desktop' ? '🖥 Desktop' : mode === 'mobile' ? '📱 Mobile' : '🥽 VR'}
            </button>
          ))}
        </div>
      </header>

      <div className="main-content">
        <div className="left-panel" ref={leftPanelRef} style={{ position: 'relative' }}>
           {viewMode !== 'mobile' && (
             <GraphView 
               ref={fgRef}
               data={graphData} 
               onNodeSelect={handleNodeSelect}
               selectedNode={selectedNode}
               width={graphSize.width}
               height={graphSize.height}
             />
           )}
           {cameraActive && viewMode === 'mobile' && (
             <div className="camera-mobile-full">
               <CameraCapture ref={cameraRef} visible />
             </div>
           )}
           {/* Overlays */}
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
               onVideoPlay={(title) => liveAssistantRef.current?.notifyVideoPlaying(title, videoData?.solution_steps)}
               onVideoPause={() => liveAssistantRef.current?.notifyVideoPaused()}
               onClose={() => {
                 liveAssistantRef.current?.notifyVideoPaused();
                 setVideoHistory(prev => [videoData, ...prev]);
                 setVideoData(null);
               }}
             />
           )}
        </div>

        <div className="right-panel">
          {viewMode !== 'vr' && (
            <div className="top-inputs">
               {viewMode !== 'mobile' && (
                 <PDFUploader 
                   onConceptsExtracted={refreshGraph}
                   onProcessingChange={(active, name) => {
                     setIsProcessing(active);
                     setProcessingFile(name);
                   }}
                 />
               )}
               <TextConceptInput onConceptsExtracted={refreshGraph} />
            </div>
          )}

          <div className="middle-inspector">
             {viewMode === 'desktop' && (
               <GestureController
                 isActive={isGestureActive}
                 onActiveChange={setIsGestureActive}
                 onSwipe={navigateDirection}
                 sharedCamera={cameraRef}
               />
             )}
          </div>

          <div className="middle-inspector">
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

             {videoHistory.length > 0 && (
               <div className="video-history" style={{ 
                 marginTop: '1rem', padding: '12px', background: 'rgba(255,255,255,0.03)', 
                 borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'
               }}>
                 <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Video History</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                   {videoHistory.map((video, idx) => (
                     <button
                       key={idx}
                       onClick={() => setVideoData(video)}
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
                       <span style={{ fontSize: '1rem', opacity: 0.8 }}>🎬</span>
                       <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{video.title}</span>
                     </button>
                   ))}
                 </div>
               </div>
             )}
          </div>

          <div className="bottom-inputs">
             <LiveAssistant 
               ref={liveAssistantRef}
               graphContainerRef={leftPanelRef}
               selectedNode={selectedNode}
               graphData={graphData}
               cameraRef={cameraRef}
               cameraActive={cameraActive}
               onMindMapReceived={handleMindMapReceived}
               onMenuReceived={setMenuData}
               onIsolatedSection={setIsolatedSectionData}
               onVideoStatus={(msg) => {
                 if (msg.status === 'generating') {
                   setIsProcessing(true);
                   setProcessingFile(msg.prompt || 'Generating Video Module...');
                 }
               }}
               onVideoReady={(data) => {
                 setIsProcessing(false);
                 setProcessingFile(null);
                 setVideoData(data);
               }}
               onVideoError={(msg) => {
                 setIsProcessing(false);
                 setProcessingFile(null);
                 console.error("Video Server Error:", msg);
               }}
               onAudioFinished={() => {
                  console.log("Audio finished! Auto-closing mind map in 1.5s...");
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
