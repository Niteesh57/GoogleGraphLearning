import React, { useState, useEffect, useRef } from 'react';
import * as base64js from 'base64-js';

const LiveAssistant = ({ onStateChange, graphContainerRef, onTextReceived, onMindMapReceived, onAudioFinished, selectedNode, graphData }) => {
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
    return () => {
      disconnect();
      hasStartedRef.current = false;
    };
  }, []);

  // ── AUTO-RECORD WHEN CONNECTED ────────────────────────────────────────
  useEffect(() => {
    if (isConnected && !isRecording && !error) {
      startRecording();
    }
  }, [isConnected, isRecording, error]);
  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletNodeRef = useRef(null);

  // VAD state — track whether the user is currently speaking
  const isSpeakingRef = useRef(false);
  const VAD_THRESHOLD = 300; // RMS amplitude out of 32768 — adjust up to reduce sensitivity
  
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
      const url = `ws://localhost:8000/live/ws-realtime`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setIsConnected(true);
        onStateChange?.('connected');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setIsConnected(false);
        setIsRecording(false);
        cleanupAudio();
        onStateChange?.('disconnected');
        
        // Auto-reconnect to maintain "Always On" state if we didn't deliberately disconnect
        if (hasStartedRef.current) {
          console.log("WebSocket closed unexpectedly. Reconnecting in 1 second...");
          setTimeout(() => {
            if (hasStartedRef.current && !wsRef.current) {
              connect();
            }
          }, 1000);
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
    if (!isConnected) return;
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

        // ── VAD: detect speech onset ──────────────────────────────────────
        const int16View = new Int16Array(int16PcmBuffer);
        let sumSq = 0;
        for (let i = 0; i < int16View.length; i++) sumSq += int16View[i] * int16View[i];
        const rms = Math.sqrt(sumSq / int16View.length);
        const speakingNow = rms > VAD_THRESHOLD;

        if (speakingNow && !isSpeakingRef.current) {
          // User just started speaking — attach a single graph snapshot
          isSpeakingRef.current = true;
          const canvas = graphContainerRef?.current?.querySelector('canvas');
          if (canvas && wsRef.current?.readyState === WebSocket.OPEN) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            const imgBase64 = dataUrl.split(',')[1];
            wsRef.current.send(JSON.stringify({
              realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: imgBase64 }] }
            }));
          }
        } else if (!speakingNow && isSpeakingRef.current) {
          isSpeakingRef.current = false;
        }
        // ─────────────────────────────────────────────────────────────────

        // Convert to Base64 to send in JSON payload
        const uint8 = new Uint8Array(int16PcmBuffer);
        const base64Data = base64js.fromByteArray(uint8);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm",
                data: base64Data
              }]
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
        const intro = `[GRAPH CONTEXT] Session started. Current node: "${selectedNode.id}". Neighbors: ${neighborNames}. Give a one-sentence intro and wait.`;
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

      // Send a fresh graph snapshot so Gemini can see the new node visually
      const canvas = graphContainerRef?.current?.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        const imgBase64 = dataUrl.split(',')[1];
        wsRef.current.send(JSON.stringify({
          realtimeInput: { mediaChunks: [{ mimeType: 'image/jpeg', data: imgBase64 }] }
        }));
      }

      const neighborNames = buildNeighborNames(selectedNode, graphData);
      const navMsg = `[GRAPH CONTEXT] User navigated to: "${selectedNode.id}". Direct connections: ${neighborNames}.`;
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: navMsg }] }],
          turnComplete: true
        }
      }));
    }, 2500);

    return () => clearTimeout(timer); // Cancel if user moves to another node quickly
  }, [selectedNode, isRecording, graphData]);

  // --- SCREEN (CANVAS) CAPTURE ---
  // Images are now sent event-driven (on node change + on speech onset via VAD)
  // instead of on a continuous interval. This avoids flooding the Gemini session.

  // --- AUDIO RECEIVE AND PLAYBACK ---
  const handleServerMessage = (msg) => {
    // Mind map data from Gemini tool call — forward to App
    if (msg.type === 'mind_map') {
      console.log('[MindMap] Received mind map:', msg.data?.title);
      onMindMapReceived?.(msg.data);
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

      // Clear the queue and reset the play cursor
      playbackQueueRef.current = [];
      nextPlayTimeRef.current = 0;  // reset so next response plays immediately

      // Keep the AudioContext alive — closing it would require a new one and cause
      // nextPlayTimeRef to be mismatched with the new context's clock
      return;
    }

    // Stale audio arriving after an interruption? Ignore it.
    if (msg._gen !== undefined && msg._gen < interruptGenRef.current) return;

    // The Python proxy simplifies the structure to { audio: base64, text: string }
    if (msg.audio) {
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
      nextPlayTimeRef.current = ctx.currentTime + 0.05;
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
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
      }

      // 1. Decode base64 to Uint8
      const binaryString = window.atob(base64String);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 2. Convert raw PCM16 bytes to Float32 AudioBuffer
      const int16Array = new Int16Array(bytes.buffer);
      const audioBuffer = playbackContextRef.current.createBuffer(
        1,
        int16Array.length,
        24000
      );
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0;
      }

      // 3. Push to queue and schedule immediately — no isPlayingRef needed
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
          <>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
            <span>Activating mic...</span>
          </>
        ) : (
          <>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            <span>Connecting to Gemini...</span>
          </>
        )}
      </div>
    </div>
  );
};

export default LiveAssistant;
