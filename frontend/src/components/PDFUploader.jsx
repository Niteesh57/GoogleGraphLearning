import { useState } from 'react';

export default function PDFUploader({ onConceptsExtracted, onProcessingChange }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    onProcessingChange?.(true, file.name); // Notify parent: processing started

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/upload-pdf`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      onConceptsExtracted(data);
    } catch (error) {
      console.error('Error uploading PDF:', error);
    } finally {
      setLoading(false);
      onProcessingChange?.(false, null); // Notify parent: processing done
    }
  };

  return (
    <div className="input-panel-card">
      <h3>Upload PDF</h3>
      <form onSubmit={handleUpload} className="upload-form">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button type="submit" disabled={!file || loading}>
          {loading ? 'Processing…' : 'Upload & Extract'}
        </button>
      </form>
    </div>
  );
}
