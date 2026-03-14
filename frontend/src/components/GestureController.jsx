import { useEffect, useRef, useState } from 'react';

const smooth = (prev, next) => prev * 0.7 + next * 0.3;

export default function GestureController({ onSwipe, isActive: propActive, onActiveChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Use local state if no prop is provided, otherwise sync with prop
  const [internalActive, setInternalActive] = useState(false);
  const isActive = propActive !== undefined ? propActive : internalActive;

  const toggleActive = () => {
    if (onActiveChange) {
      onActiveChange(!isActive);
    } else {
      setInternalActive(!isActive);
    }
  };

  // Keep latest values accessible inside the MediaPipe loop without restarting it
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => { onSwipeRef.current = onSwipe; }, [onSwipe]);

  // Tracking state (lives inside ref so it doesn't trigger re-renders)
  const state = useRef({
    cursorX: 0,
    cursorY: 0,
    prevCursorX: null,
    prevCursorY: null,
    prevPinchDist: null,
  });

  useEffect(() => {
    if (!isActive) return;
    let destroyed = false;

    const hands = new window.Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    hands.onResults((results) => {
      if (destroyed || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results.multiHandLandmarks?.length) {
        state.current.prevCursorX = null;
        state.current.prevCursorY = null;
        state.current.prevPinchDist = null;
        ctx.restore();
        return;
      }

      const hand = results.multiHandLandmarks[0];
      window.drawConnectors(ctx, hand, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 1.5 });
      window.drawLandmarks(ctx, hand, { color: '#FF0000', lineWidth: 1, radius: 1.5 });

      // Index fingertip (8) = cursor
      const index = hand[8];

      // Mirror X so moving right feels like moving right
      const rawX = (1 - index.x) * canvas.width;
      const rawY = index.y * canvas.height;

      state.current.cursorX = smooth(state.current.cursorX, rawX);
      state.current.cursorY = smooth(state.current.cursorY, rawY);

      const cx = state.current.cursorX;
      const cy = state.current.cursorY;

      // Draw cursor indicator
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
      ctx.strokeStyle = '#00BFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // ── NODE FOCUS: DIRECTIONAL SWIPE NAVIGATION ───────────────────────────
      if (state.current.prevCursorX !== null) {
        const dx = cx - state.current.prevCursorX;
        const dy = cy - state.current.prevCursorY;

        // Require a firm swipe gesture to trigger navigation
        if (Math.abs(dx) > 15 || Math.abs(dy) > 15) { 
          const swipeAngle = Math.atan2(dy, dx);
          let direction = "NONE";

          if (swipeAngle > -Math.PI / 4 && swipeAngle <= Math.PI / 4) direction = "RIGHT";
          else if (swipeAngle > Math.PI / 4 && swipeAngle <= 3 * Math.PI / 4) direction = "DOWN";
          else if (swipeAngle < -Math.PI / 4 && swipeAngle >= -3 * Math.PI / 4) direction = "UP";
          else direction = "LEFT";

          onSwipeRef.current?.(direction);
          
          state.current.prevCursorX = cx;
          state.current.prevCursorY = cy;
        }
      }

      if (Math.abs(cx - (state.current.prevCursorX||cx)) < 15 && Math.abs(cy - (state.current.prevCursorY||cy)) < 15) {
        state.current.prevCursorX = cx;
        state.current.prevCursorY = cy;
      }
    });

    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (!destroyed) await hands.send({ image: videoRef.current });
      },
      width: 320,
      height: 240
    });

    camera.start();

    return () => {
      destroyed = true;
      state.current.prevCursorX = null;
      state.current.prevCursorY = null;
      state.current.prevPinchDist = null;
      camera.stop();
      try { hands.close(); } catch (e) { }
    };
  }, [isActive]); 

  return (
    <div className="input-panel-card gesture-card">
      <h3>Gesture Navigation</h3>
      <div className="gesture-controls">
        <button
          className={`mic-button ${isActive ? 'active' : ''}`}
          onClick={toggleActive}
          style={{ marginBottom: '0.5rem' }}
        >
          {isActive ? '✋ Stop Gesture Mode' : '🖐 Start Gesture Mode'}
        </button>
      </div>
      {isActive && (
        <div style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.5rem', lineHeight: 1.6 }}>
          👋 Swipe Hand (Up/Down/Left/Right) to jump to next connected concept
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', display: isActive ? 'block' : 'none' }}>
        <video
          ref={videoRef}
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, transform: 'scaleX(-1)' }}
        />
      </div>
    </div>
  );
}
