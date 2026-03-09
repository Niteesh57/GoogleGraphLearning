import { useState, useRef } from 'react';

export default function VoiceAssistant({ selectedNode, onAskGeminiRaw }) {
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const toggleListen = async () => {
    if (!isListening) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          
          if (onAskGeminiRaw && selectedNode) {
            onAskGeminiRaw(audioBlob, selectedNode);
          }
        };

        mediaRecorderRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Microphone access is required for voice commands.");
      }
    } else {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsListening(false);
    }
  };

  return (
    <div className="input-panel-card voice-card">
      <h3>Voice & AI</h3>
      <div className="voice-status">
        <button 
          className={`mic-button ${isListening ? 'active' : ''}`}
          onClick={toggleListen}
        >
          {isListening ? 'Listening... (Click to Send)' : 'Start Voice Command'}
        </button>
      </div>
      <p className="voice-hint">
        {selectedNode 
          ? `Ask a question about ${selectedNode.id}`
          : 'Select a node first to ask questions.'}
      </p>
    </div>
  );
}
