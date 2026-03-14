import { useState } from 'react';

export default function TextConceptInput({ onConceptsExtracted }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const submitText = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/text-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.status === 'added') {
        onConceptsExtracted(); // Signal to refetch graph state
        setText("");
      }
    } catch (error) {
      console.error("Error generating concepts:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="input-panel-card">
      <h3>Text Input</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a concept description..."
        className="text-input-area"
      />
      <button onClick={submitText} disabled={!text.trim() || loading}>
        {loading ? 'Processing...' : 'Generate Concepts'}
      </button>
    </div>
  );
}
