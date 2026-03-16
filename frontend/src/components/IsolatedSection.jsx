import React from 'react';
import ReactMarkdown from 'react-markdown';

const IsolatedSection = ({ sectionData, onClose }) => {
  if (!sectionData) return null;

  const { title, content_type, payload } = sectionData;

  const renderContent = () => {
    switch (content_type) {
      case 'interactive_quiz':
        return (
          <div className="quiz-content">
            <h3 style={{ color: '#60a5fa', marginBottom: '1rem' }}>{payload.question}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(payload.options || []).map((opt, i) => (
                <button
                  key={i}
                  style={{
                    padding: '12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                    color: '#fff', textAlign: 'left', cursor: 'pointer'
                  }}
                  onClick={() => alert(opt === payload.correct_answer ? "Correct!" : "Try again!")}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      case 'concept_deep_dive':
        return (
          <div className="deep-dive-content" style={{ color: '#e2e8f0', textAlign: 'left' }}>
            <ReactMarkdown>{payload.explanation || ''}</ReactMarkdown>
            {payload.key_points && (
              <ul style={{ marginTop: '1rem' }}>
                {payload.key_points.map((pt, i) => <li key={i}>{pt}</li>)}
              </ul>
            )}
          </div>
        );
      case 'functional_module':
        return (
          <div className="functional-content" style={{ textAlign: 'left' }}>
            <p style={{ color: '#94a3b8' }}>{payload.description}</p>
            {payload.image_b64 && (
              <div style={{ marginTop: '1.5rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <img 
                  src={`data:image/jpeg;base64,${payload.image_b64}`} 
                  alt="Reference" 
                  style={{ width: '100%', height: 'auto', display: 'block' }} 
                />
              </div>
            )}
            <div style={{ padding: '20px', border: '2px dashed #3b82f6', borderRadius: '12px', marginTop: '1rem', textAlign: 'center' }}>
               <h4 style={{ color: '#3b82f6' }}>{payload.module_name || 'Active Module'}</h4>
               <p style={{ fontSize: '0.8rem', color: '#64748b' }}>This section was dynamically generated based on your camera input.</p>
            </div>
          </div>
        );
      case 'visual_reference':
        return (
          <div className="visual-reference-content">
             {payload.image_b64 ? (
               <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                 <img src={`data:image/jpeg;base64,${payload.image_b64}`} alt="Reference" style={{ width: '100%' }} />
               </div>
             ) : (
               <div style={{ padding: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '2px dashed rgba(255,255,255,0.1)' }}>
                 <p style={{ color: '#64748b' }}>No image data provided in payload.</p>
               </div>
             )}
             <div style={{ marginTop: '1.5rem', color: '#e2e8f0', textAlign: 'left' }}>
               <ReactMarkdown>{payload.analysis || 'Visual content captured for reference.'}</ReactMarkdown>
             </div>
          </div>
        );
      default:
        return <p>Section content generated successfully.</p>;
    }
  };

  return (
    <div className="isolated-section-overlay" style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(2, 6, 23, 0.95)', zIndex: 1100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(16px)', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div className="section-container" style={{
        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
        padding: '3rem', borderRadius: '32px',
        border: '1px solid rgba(255, 255, 255, 0.1)', maxWidth: '700px', width: '90%',
        boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.7)',
        maxHeight: '85vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <span style={{ color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px' }}>New Section Generated</span>
            <h2 style={{ color: '#fff', fontSize: '2.2rem', marginTop: '0.5rem' }}>{title}</h2>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8',
              width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem'
            }}
          >
            ✕
          </button>
        </div>

        <div className="section-body" style={{ background: 'rgba(0,0,0,0.2)', padding: '2rem', borderRadius: '20px' }}>
          {renderContent()}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '15px' }}>
           <button 
             onClick={onClose}
             style={{
               flex: 1, padding: '1rem', borderRadius: '12px', background: '#3b82f6', color: '#fff',
               fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)'
             }}
           >
             Continue Exploration
           </button>
        </div>
      </div>
    </div>
  );
};

export default IsolatedSection;
