import React from 'react';

const MenuViewer = ({ menuData, onClose }) => {
  if (!menuData) return null;

  return (
    <div className="menu-viewer-overlay" style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.9)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(12px)', transition: 'all 0.3s ease'
    }}>
      <div className="menu-container" style={{
        background: 'rgba(30, 41, 59, 0.7)', padding: '2.5rem', borderRadius: '24px',
        border: '1px solid rgba(255, 255, 255, 0.1)', maxWidth: '500px', width: '90%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', textAlign: 'center'
      }}>
        <h2 style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '1.8rem' }}>{menuData.title}</h2>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Interactive Options Extracted from Screen</p>
        
        <div className="menu-items" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {menuData.items.map((item) => (
            <button
              key={item.id}
              className="menu-item-btn"
              onClick={() => {
                console.log(`Action: ${item.action} for ${item.label}`);
                onClose();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)', color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)', padding: '1rem 1.5rem',
                borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span>{item.label}</span>
              <span style={{ fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase' }}>{item.action}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={onClose}
          style={{
            marginTop: '2.5rem', background: 'transparent', color: '#64748b',
            border: 'none', cursor: 'pointer', fontSize: '1rem'
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default MenuViewer;
