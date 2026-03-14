import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as base64js from 'base64-js';

const SESSION_ID_KEY = 'vr_session_id';
function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

const LiveAssistant = forwardRef(({ onStateChange, graphContainerRef, onTextReceived, onMindMapReceived, onVideoStatus, onVideoReady, onVideoError, onAudioFinished, selectedNode, graphData, cameraRef, cameraActive }, ref) => {
  // Track whether a video is actively playing so frame capture loop knows to send frames
  const isVideoPlayingRef = useRef(false);
  const videoTitleRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletNodeRef = useRef(null);
  // Narration keepalive: sends timed script segments so Gemini narrates the FULL video
  const narrationKeepaliveRef = useRef(null);
  const narrationSegmentsRef = useRef([]);  // Array of {text, delay}
  const narrationIndexRef = useRef(0);

  // Parse solution_steps string into timed narration segments
  const parseSolutionSteps = (steps, videoDurationSec = 120) => {
    if (!steps) return [];
    // Split by newlines or step markers
    const raw = steps.split(/\n|Step \d+:/i).map(s => s.trim()).filter(s => s.length > 10);
    if (raw.length === 0) return [];
    const intervalSec = Math.max(6, Math.floor(videoDurationSec / raw.length));
    return raw.map((text, i) => ({ text, delay: i * intervalSec * 1000 }));
  };

  // Expose imperative methods so App.jsx can call from VideoViewer callbacks
  useImperativeHandle(ref, () => ({
    notifyVideoPlaying: (title, solutionSteps) => {
      isVideoPlayingRef.current = true;
      videoTitleRef.current = title;

      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      // 1. Parse solution steps into narration segments timed across the video
      const videoEl = document.getElementById('active-video-player');
      const duration = videoEl?.duration || 120; // fallback to 2 minutes
      const segments = parseSolutionSteps(solutionSteps, duration);
      narrationSegmentsRef.current = segments;
      narrationIndexRef.current = 0;

      // 2. Send the opening narration instruction to Gemini
      const openingMsg = [
        `[VIDEO NARRATION START] A video titled "${title || 'Animation'}" is now playing.`,
        `You are a live teacher narrator. Your job is to explain this video continuously for its FULL duration (${Math.round(duration)} seconds).`,
        `CRITICAL RULES:`,
        `- You will receive both video frames AND narration script segments as the video progresses.`,
        `- When you receive a [NARRATE NOW] message with script content, speak that content naturally and then WAIT for the next one.`,
        `- When you receive a video frame image, use it to describe what you visually see HAPPENING right now.`,
        `- DO NOT stop speaking until you receive [VIDEO NARRATION END].`,
        `- Keep your tone like a friendly teacher explaining concepts step by step.`,
        `- IGNORE the 1-2 sentence limit completely for the duration of this video.`,
      ].join(' ');
      wsRef.current.send(JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text: openingMsg }] }], turnComplete: true }
      }));

      // 3. Stop any existing keepalive
      if (narrationKeepaliveRef.current) clearInterval(narrationKeepaliveRef.current);

      // 4. Start the narration keepalive loop
      // Every 8s, send the next script segment as a new user-turn so Gemini keeps talking
      narrationKeepaliveRef.current = setInterval(() => {
        if (!isVideoPlayingRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
          clearInterval(narrationKeepaliveRef.current);
          return;
        }
        const videoEl = document.getElementById('active-video-player');
        if (videoEl && videoEl.ended) {
          // Video ended — send final message and stop
          wsRef.current.send(JSON.stringify({
            clientContent: { turns: [{ role: 'user', parts: [{ text: '[VIDEO NARRATION END] The video has finished. Give a one-sentence summary and stop.' }] }], turnComplete: true }
          }));
          clearInterval(narrationKeepaliveRef.current);
          return;
        }

        // Send the next narration segment (or a generic continue prompt if we ran out)
        const segments = narrationSegmentsRef.current;
        const idx = narrationIndexRef.current;
        let prompt;
        if (segments.length > 0 && idx < segments.length) {
          prompt = `[NARRATE NOW] ${segments[idx].text}`;
          narrationIndexRef.current += 1;
        } else {
          // Fallback: ask Gemini to narrate what it sees in the current frame
          prompt = `[NARRATE NOW] Describe what is visually happening in the video right now. Explain it clearly for a student.`;
        }
        wsRef.current.send(JSON.stringify({
          clientContent: { turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true }
        }));
      }, 8000); // Every 8 seconds — keeps Gemini speaking continuously
    },

    notifyVideoPaused: () => {
      isVideoPlayingRef.current = false;
      videoTitleRef.current = null;
      // Stop the keepalive loop immediately when video pauses/ends
      if (narrationKeepaliveRef.current) {
        clearInterval(narrationKeepaliveRef.current);
        narrationKeepaliveRef.current = null;
      }
    }
  }));
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  
  // ── AUTO-START ON MOUNT ───────────────────────────────────────────────
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      connect();
    }

    // Handle background/foreground transitions for mobile
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Mobile] App returned to foreground. Resuming contexts...');
        if (playbackContextRef.current?.state === 'suspended') {
          playbackContextRef.current.resume().catch(console.error);
        }
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume().catch(console.error);
        }
        // Signal backend if needed or just let the next audio chunk trigger it
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disconnect();
      hasStartedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ── 🚫 AUTO-RECORD REMOVED to satisfy Chrome Autoplay Policy
  // AudioContext creation must be triggered by a direct user gesture.
  // VAD state — track whether the user is currently speaking
  const isSpeakingRef = useRef(false);
  // Threshold raised from 300 → 1500: 300 was firing on fan/ambient noise, causing
  // a canvas JPEG to be sent on nearly every audio callback. This flooded the backend.
  const VAD_THRESHOLD = 1500;

  // Latency tracking
  const lastSpikeTimeRef = useRef(null);   // performance.now() at the moment user speaks
  const firstResponseLoggedRef = useRef(false); // whether we already logged the round-trip for this turn
  
  // To play back audio from Gemini
  const playbackContextRef = useRef(null);
  const playbackQueueRef = useRef([]);
  // Track active BufferSourceNodes so we can stop them on interrupt
  const activeSourceNodesRef = useRef([]);
  // Monotonic counter — increments on every interruption so stale audio is ignored
  const interruptGenRef = useRef(0);

  // Constants for Gemini Multimodal Live API
  const HOST = 'generativelanguage.googleapis.com';
  
  const cleanupAudio = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
  };

  const connect = async () => {
    try {
      setError(null);
      
      // Open WebSocket directly to our backend proxy instead of Google
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const wsUrl = baseUrl.replace(/^http/, 'ws');
      const url = `${wsUrl}/live/ws-realtime`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setIsConnected(true);
        onStateChange?.('connected');

        // Send session identity immediately so backend can restore memory context
        const sessionId = getOrCreateSessionId();
        ws.send(JSON.stringify({ type: 'init', sessionId }));
        console.log(`[Session] Identified as ${sessionId}`);
        
        // If we reconnected during an active session, automatically resume capture
        if (hasStartedRef.current) {
          console.log("Reconnected successfully. Resuming capture...");
          setTimeout(() => {
            startRecording();
          }, 100);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setIsConnected(false);
        setIsRecording(false);
        cleanupAudio();
        onStateChange?.('disconnected');
        
        // Nullify reference so the timeout knows it's safe to spawn a new socket
        wsRef.current = null;
        
        // Auto-reconnect to maintain "Always On" state if we didn't deliberately disconnect
        if (hasStartedRef.current) {
          console.log("WebSocket closed unexpectedly. Reconnecting in 5 seconds...");
          setTimeout(() => {
            if (hasStartedRef.current && !wsRef.current) {
              connect();
            }
          }, 5000);
        }
      };

      ws.onerror = (e) => {
        if (wsRef.current !== ws) return;
        console.error("Live WebSocket Error:", e);
        setError("WebSocket error occurred.");
      };

      ws.onmessage = async (event) => {
        if (wsRef.current !== ws) return;
        if (event.data instanceof Blob) {
           const text = await event.data.text();
           handleServerMessage(JSON.parse(text));
        } else {
           handleServerMessage(JSON.parse(event.data));
        }
      };

    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const disconnect = () => {
    const ws = wsRef.current;
    if (ws) {
      // Unbind handlers so an aggressively aborted socket doesn't trigger an error in state
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      wsRef.current = null;
    }
    cleanupAudio();
    setIsConnected(false);
    setIsRecording(false);
  };

  // --- AUDIO CAPTURE AND SEND ---
  const startRecording = async () => {
    // We check wsRef instead of isConnected state because state updates are async
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try {
      // Create a 16kHz audio context as required by Gemini
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      // Load our custom Worklet that grabs raw PCM
      await audioContextRef.current.audioWorklet.addModule('/pcm-processor.js');

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
        } 
      });

      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'pcm-processor');

      workletNodeRef.current.port.onmessage = (e) => {
        const int16PcmBuffer = e.data; // ArrayBuffer from the worklet

        // ── VAD: only used for local barge-in detection ───────────────────
        // Audio is always streamed to Gemini — Gemini's server-side VAD reads
        // the silence frames to know when you've stopped talking and responds.
        // Local VAD's only job: instantly kill Gemini's playback the moment
        // a voice spike is detected so barge-in feels instant.
        const int16View = new Int16Array(int16PcmBuffer);
        let sumSq = 0;
        for (let i = 0; i < int16View.length; i++) sumSq += int16View[i] * int16View[i];
        const rms = Math.sqrt(sumSq / int16View.length);
        const speakingNow = rms > VAD_THRESHOLD;

        // Rising edge only — kill playback immediately on new voice spike
        if (speakingNow && !isSpeakingRef.current) {
          isSpeakingRef.current = true;
          interruptGenRef.current += 1;
          activeSourceNodesRef.current.forEach(n => { try { n.stop(); } catch (_) {} });
          activeSourceNodesRef.current = [];
          playbackQueueRef.current = [];
          nextPlayTimeRef.current = playbackContextRef.current?.currentTime ?? 0;
          playCounterRef.current = 0;
          lastSpikeTimeRef.current = performance.now();
          firstResponseLoggedRef.current = false;
          console.log('%c[⚡ SPIKE] Voice detected — flushed Gemini playback instantly.', 'color:#f90;font-weight:bold');

          // If camera is active, send the current frame so Gemini sees the book page
          if (cameraActive && cameraRef?.current) {
            const frameB64 = cameraRef.current.captureCurrentFrame();
            if (frameB64 && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                realtimeInput: {
                  mediaChunks: [{ mimeType: 'image/jpeg', data: frameB64 }]
                }
              }));
            }
          }
        } else if (!speakingNow && isSpeakingRef.current) {
          isSpeakingRef.current = false;
        }

        // ── Always stream all audio frames to Gemini (including silence) ──
        // Gemini's VAD needs the silence to detect end-of-turn and respond.
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const uint8 = new Uint8Array(int16PcmBuffer);
          const base64Data = base64js.fromByteArray(uint8);
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: base64Data }]
            }
          }));
        }
      };

      source.connect(workletNodeRef.current);
      
      // Fix: Chrome will garbage collect or suspend an AudioWorkletNode that isn't connected to a destination.
      // We route it to a GainNode with 0 volume so it stays alive without causing an echo.
      const mutedGainNode = audioContextRef.current.createGain();
      mutedGainNode.gain.value = 0;
      workletNodeRef.current.connect(mutedGainNode);
      mutedGainNode.connect(audioContextRef.current.destination);
      
      // ── PRE-INIT PLAYBACK CONTEXT ──────────────────────────────────────────
      // Create the 24kHz playback AudioContext here, inside a user-gesture callback,
      // so Chrome's autoplay policy is satisfied before the first audio chunk arrives.
      // This eliminates the silent gap / delayed first response.
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }
      // Resume in case the browser suspended it (tab focus changes, etc.)
      if (playbackContextRef.current.state === 'suspended') {
        playbackContextRef.current.resume().catch(console.error);
      }

      setIsRecording(true);
      onStateChange?.('recording');

      // ── SEND IMMEDIATE CONTEXT SNAPSHOT ───────────────────────────────────
      // 1. Send a graph screenshot right away so Gemini can see the current state
      const canvas = graphContainerRef?.current?.querySelector('canvas');
      if (canvas && wsRef.current?.readyState === WebSocket.OPEN) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const base64Data = dataUrl.split(',')[1];
        wsRef.current.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: base64Data }] }
        }));
      }

      // 2. Send a SHORT intro context — let Gemini give a brief welcome, not a lecture
      if (selectedNode && graphData && wsRef.current?.readyState === WebSocket.OPEN) {
        const neighborNames = buildNeighborNames(selectedNode, graphData);
        const intro = `[GRAPH] At: "${selectedNode.id}". Neighbors: ${neighborNames}. 1-sentence intro.`;
        wsRef.current.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: intro }] }], turnComplete: true } }));
      }

    } catch (err) {
      console.error("Error starting mic:", err);
      setError("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    cleanupAudio();
    setIsRecording(false);
    onStateChange?.('connected');
  };

  // Helper: Build neighbor names string from graphData
  const buildNeighborNames = (node, gData) => {
    if (!node || !gData) return 'none';
    const links = gData.links || [];
    const nodes = gData.nodes || [];
    const neighborIds = new Set();
    links.forEach(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === node.id) neighborIds.add(tid);
      if (tid === node.id) neighborIds.add(sid);
    });
    return nodes.filter(n => neighborIds.has(n.id)).map(n => n.id).join(', ') || 'none';
  };

  // ── AUTO-NARRATE ON NODE NAVIGATION ────────────────────────────────────
  // When the user swipes to a new node during an active recording session,
  // send a brief one-liner to Gemini so it automatically narrates the change.
  const prevNodeIdRef = useRef(null);
  useEffect(() => {
    if (!isRecording || !selectedNode || !graphData) return;
    if (selectedNode.id === prevNodeIdRef.current) return;
    
    // Debounce: Wait 2.5 seconds of staying on the same node before notifying Gemini
    const timer = setTimeout(() => {
      prevNodeIdRef.current = selectedNode.id;

      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      // Don't send graph snapshots during video — it would break Gemini's video narration focus
      if (!isVideoPlayingRef.current) {
        const canvas = graphContainerRef?.current?.querySelector('canvas');
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          const imgBase64 = dataUrl.split(',')[1];
          wsRef.current.send(JSON.stringify({
            realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: imgBase64 }] }
          }));
        }
      }

      const neighborNames = buildNeighborNames(selectedNode, graphData);
      const navMsg = `[GRAPH] At: "${selectedNode.id}". Neighbors: ${neighborNames}.`;
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: navMsg }] }],
          turnComplete: true
        }
      }));
    }, 2500);

    return () => clearTimeout(timer); // Cancel if user moves to another node quickly
  }, [selectedNode, isRecording, graphData]);

  // --- SCREEN (CANVAS) & VIDEO CAPTURE ---
  // Graph Images are sent event-driven (on node change + on speech onset via VAD) to avoid flooding.
  // Video frames are sent at 1fps ONLY while a video is genuinely playing (not paused/ended).
  useEffect(() => {
    if (!isConnected || !isRecording) return;
    
    const interval = setInterval(() => {
      // Only capture frames when video is actively playing (guarded by ref set via notifyVideoPlaying)
      if (!isVideoPlayingRef.current) return;

      const videoEl = document.getElementById('active-video-player');
      if (videoEl && !videoEl.paused && !videoEl.ended) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            // Draw current video frame to an offscreen canvas
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth || 640;
            canvas.height = videoEl.videoHeight || 360;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            const imgBase64 = dataUrl.split(',')[1];
            
            wsRef.current.send(JSON.stringify({
              realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: imgBase64 }] }
            }));
          } catch (e) {
            console.error("Failed to capture video frame:", e);
          }
        }
      } else if (videoEl && (videoEl.paused || videoEl.ended)) {
        // Sync the ref if video was paused without using our callback (e.g. user clicked pause manually)
        isVideoPlayingRef.current = false;
      }
    }, 500); // 2fps capture rate for Live Video — more frames = better narration sync
    
    return () => clearInterval(interval);
  }, [isConnected, isRecording]);

  // --- AUDIO RECEIVE AND PLAYBACK ---
  const handleServerMessage = (msg) => {
    // Mind map data from Gemini tool call — forward to App
    if (msg.type === 'mind_map') {
      console.log('[MindMap] Received mind map:', msg.data?.title);
      onMindMapReceived?.(msg.data);
      return;
    }

    if (msg.type === 'video_status') {
      console.log('[Video] Status:', msg.status);
      onVideoStatus?.(msg);
      return;
    }
    
    if (msg.type === 'video_ready') {
      console.log('[Video] Ready:', msg.data?.title);
      // Just show the video — narration will start ONLY when the video actually plays (via notifyVideoPlaying)
      onVideoReady?.(msg.data);
      return;
    }
    
    if (msg.type === 'video_error') {
      console.error('[Video] Error:', msg.message);
      onVideoError?.(msg.message);
      return;
    }

    // If Gemini was interrupted by the user speaking, flush playback immediately
    if (msg.interrupted) {
      console.log('[Barge-in] Interrupted signal received — flushing audio buffer.');

      // Increment generation so any audio chunks already in-flight are ignored
      interruptGenRef.current += 1;

      // Stop every scheduled/playing source node right now
      activeSourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch (_) {}
      });
      activeSourceNodesRef.current = [];

      // Clear the queue and reset the play cursor to NOW so the next response
      // plays immediately without hitting the +50ms padding in scheduleQueue.
      playbackQueueRef.current = [];
      nextPlayTimeRef.current = playbackContextRef.current?.currentTime ?? 0;
      playCounterRef.current = 0;   // fix: ensure we don't block subsequent auto-closing

      // Keep the AudioContext alive — closing it would require a new one and cause
      // nextPlayTimeRef to be mismatched with the new context's clock
      return;
    }

    // Stale audio arriving after an interruption? Ignore it.
    if (msg._gen !== undefined && msg._gen < interruptGenRef.current) return;

    // The Python proxy simplifies the structure to { audio: base64, text: string }
    if (msg.audio) {
      if (!firstResponseLoggedRef.current && lastSpikeTimeRef.current !== null) {
        const latencyMs = (performance.now() - lastSpikeTimeRef.current).toFixed(0);
        console.log(`%c[🚀 RESPONSE] First audio back from Gemini: ${latencyMs}ms after spike`, 'color: #4f4; font-weight: bold');
        firstResponseLoggedRef.current = true;
      }
      playAudioChunk(msg.audio);
    }
    if (msg.text) {
      onTextReceived?.(msg.text);
    }
  };



  // Keep track of exactly when the last chunk finishes so the next begins seamlessly
  const nextPlayTimeRef = useRef(0);
  const playCounterRef = useRef(0); // number of chunks currently scheduled/playing

  // Drain the playback queue and schedule everything onto the Web Audio timeline.
  // The browser handles gapless playback.
  const scheduleQueue = () => {
    const ctx = playbackContextRef.current;
    if (!ctx) return;

    // If nextPlayTime is in the past (start of session or post-interrupt), reset slightly ahead
    if (nextPlayTimeRef.current < ctx.currentTime) {
      nextPlayTimeRef.current = ctx.currentTime + 0.01;
    }

    while (playbackQueueRef.current.length > 0) {
      const buffer = playbackQueueRef.current.shift();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      // Track so we can hard-stop on barge-in
      activeSourceNodesRef.current.push(source);
      playCounterRef.current += 1;

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buffer.duration;

      source.onended = () => {
        activeSourceNodesRef.current = activeSourceNodesRef.current.filter(n => n !== source);
        playCounterRef.current -= 1;
        
        // If this was the absolute last chunk playing and there are no more chunks queued,
        // trigger the onAudioFinished callback (used to auto-close the mind map).
        if (playCounterRef.current === 0 && playbackQueueRef.current.length === 0) {
          onAudioFinished?.();
        }
      };
    }
  };

  const playAudioChunk = (base64String) => {
    try {
      // Playback context is pre-initialized in startRecording().
      // Fallback: create lazily in case audio arrives before recording starts.
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }
      if (playbackContextRef.current.state === 'suspended') {
        playbackContextRef.current.resume().catch(console.error);
      }

      // 1. Fast base64 → Uint8Array using base64-js (already imported)
      const bytes = base64js.toByteArray(base64String);

      // 2. Convert raw PCM16 bytes to Float32 AudioBuffer
      const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const audioBuffer = playbackContextRef.current.createBuffer(
        1,
        int16Array.length,
        24000
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0;
      }

      // 3. Push to queue and schedule immediately
      playbackQueueRef.current.push(audioBuffer);
      scheduleQueue();

    } catch (e) {
      console.error('Audio playback decode error', e);
    }
  };


  return (
    <div className="live-assistant-panel" style={{ padding: '0.75rem', background: 'transparent', border: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', justifyContent: 'center' }}>
        {error ? (
          <span style={{ color: '#ef4444' }}>❌ {error}</span>
        ) : isRecording ? (
          <>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981', animation: 'pulse 2s infinite' }} />
            <span>Live AI Tutor Active</span>
          </>
        ) : isConnected ? (
          <button 
            onClick={startRecording}
            style={{ 
              background: '#3b82f6', color: '#fff', border: 'none', 
              padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 'bold'
            }}
          >
            Start Mic
          </button>
        ) : (
          <>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            <span>Connecting to Gemini...</span>
          </>
        )}
      </div>
    </div>
  );
});

export default LiveAssistant;
