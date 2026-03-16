import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';

/**
 * CameraCapture — always-on live camera feed.
 * - No capture buttons: caller grabs a frame via captureCurrentFrame()
 * - Front/back toggle (↺)
 * - Exposes ref handle: { captureCurrentFrame, facingMode }
 */
const CameraCapture = forwardRef(function CameraCapture({ visible = true, className = '' }, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment'); // back camera by default
  const [error, setError] = useState(null);

  const startCamera = useCallback(async (mode) => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else {
        setError('Camera unavailable or in use by another app.');
      }
      console.error('Camera error:', err);
    }
  }, []);

  // Start camera when component mounts or facingMode changes
  useEffect(() => {
    if (visible) startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [visible, facingMode, startCamera]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  /** Grab the current video frame as a base64 JPEG string */
  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    // Return base64-encoded JPEG (strip the data-URI prefix)
    return canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
  }, []);

  // Expose capture + facingMode to parent through ref
  useImperativeHandle(ref, () => ({ 
    captureCurrentFrame, 
    facingMode,
    get videoElement() { return videoRef.current; }
  }), [captureCurrentFrame, facingMode]);

  if (!visible) return null;

  return (
    <div className={`camera-capture ${className}`}>
      {error ? (
        <div className="camera-error">
          <p>📵 {error}</p>
          <button onClick={() => startCamera(facingMode)} className="camera-retry-btn">
            Grant Camera Access
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-preview"
          />
          <button
            className="camera-toggle-btn"
            onClick={toggleCamera}
            title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
          >
            ↺ {facingMode === 'environment' ? 'Back' : 'Front'}
          </button>
        </>
      )}
    </div>
  );
});

export default CameraCapture;
