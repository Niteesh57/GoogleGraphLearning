import { useEffect, useRef, useState } from 'react';

const smooth = (prev, next) => prev * 0.7 + next * 0.3;

export default function GestureController({ onSwipe }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);

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

      // Index fingertip (8) = cursor; Thumb (4) = pinch partner
      const index = hand[8];
      const thumb = hand[4];

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

      // ── GRAPH PANNING REMOVED ──────────────────────────────────────────────
      // ── PINCH ZOOM REMOVED ──────────────────────────────────────────

      // ── NODE FOCUS: DIRECTIONAL SWIPE NAVIGATION ───────────────────────────
      if (state.current.prevCursorX !== null) {
        const dx = cx - state.current.prevCursorX;
        const dy = cy - state.current.prevCursorY;

        // Require a firm swipe gesture to trigger navigation
        if (Math.abs(dx) > 15 || Math.abs(dy) > 15) { // tuned swipe threshold
          // Calculate angle of swipe
          const swipeAngle = Math.atan2(dy, dx);
          let direction = "NONE";

          // pi/4 = 45 degrees. Classify into 4 quadrants
          if (swipeAngle > -Math.PI / 4 && swipeAngle <= Math.PI / 4) direction = "RIGHT";
          else if (swipeAngle > Math.PI / 4 && swipeAngle <= 3 * Math.PI / 4) direction = "DOWN";
          else if (swipeAngle < -Math.PI / 4 && swipeAngle >= -3 * Math.PI / 4) direction = "UP";
          else direction = "LEFT";

          // Call the central navigation function in App.jsx
          onSwipeRef.current?.(direction);
          
          // "Consume" the swipe by resetting the tracking coordinates so it doesn't trigger repeatedly
          state.current.prevCursorX = cx;
          state.current.prevCursorY = cy;
        }
      }

      // Only update previous position if we didn't just consume a swipe
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
  }, [isActive]); // fgRef, graphData, onNodeFocus never go in here — handled via refs above

  return (
    <div className="input-panel-card gesture-card">
      <h3>Gesture Navigation</h3>
      <div className="gesture-controls">
        <button
          className={`mic-button ${isActive ? 'active' : ''}`}
          onClick={() => setIsActive(a => !a)}
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
