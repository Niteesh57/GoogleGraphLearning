import { useState, useCallback } from 'react';

/**
 * PermissionsModal — A sleek onboarding overlay to request camera/mic access.
 * Standard browsers require a direct user gesture (click) to trigger permission prompts.
 */
export default function PermissionsModal({ isOpen, onClose, onGranted }) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState(null);

  const requestAccess = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      // Request both at once
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      // Immediately stop them — we just wanted to grant the permission for the session
      stream.getTracks().forEach(track => track.stop());
      onGranted();
    } catch (err) {
      console.error('Permission request failed:', err);
      setError('Access denied. Please enable camera and microphone in your browser settings to use Mobile/VR mode.');
    } finally {
      setRequesting(false);
    }
  }, [onGranted]);

  if (!isOpen) return null;

  return (
    <div className="permissions-modal-overlay">
      <div className="permissions-modal-content">
        <h2>Enable Experience</h2>
        <p>Mobile and VR modes require camera and microphone access to see and hear you.</p>
        
        {error && <div className="permissions-error">{error}</div>}
        
        <div className="permissions-modal-actions">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button 
            onClick={requestAccess} 
            className="btn-primary" 
            disabled={requesting}
          >
            {requesting ? 'Requesting...' : 'Grant Access'}
          </button>
        </div>
      </div>
    </div>
  );
}
