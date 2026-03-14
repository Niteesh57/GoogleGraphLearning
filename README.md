# Live AI Knowledge Graph Explorer 🥽📱

A real-time, multimodal educational assistant that transforms learning into a spatial, interactive experience. Built for the **Gemini Live Agent Challenge**.

## 🚀 Overview
The **Live AI Knowledge Graph Explorer** leverages the **Gemini Multimodal Live API** to bridge the gap between physical books and digital knowledge. By "seeing" through your camera and "hearing" your voice, the agent builds dynamic knowledge graphs, generates animated educational videos, and navigates complex topics through hand gestures.

### Key Features
- **Live Multimodal Tutor**: Real-time voice and vision interaction using Gemini 2.5 Flash.
- **Interactive Mind Mapping**: Automatically generates knowledge graphs from camera frames (e.g., a page of a book).
- **Animated Educational Videos**: Integrates with a Manim-based video service to generate animations on the fly.
- **Spatial Gesture Navigation**: Hands-free exploration of the knowledge graph using MediaPipe hand tracking.
- **VR & Mobile Modes**: Immersive split-screen VR mode and a prominent AR-style Mobile mode.

## 🛠 Tech Stack
- **AI**: Gemini 2.5 Flash (Multimodal Live API), Google GenAI SDK.
- **Frontend**: React, Vite, React Force Graph, MediaPipe (Hands).
- **Backend**: FastAPI, WebSockets, ChromaDB (Vector Search).
- **Animations**: Manim (Mathematical Animation Engine).
- **Hosting**: Designed for Google Cloud (Cloud Run & Firebase).

## 🏃‍♂️ Spin-up Instructions

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- Gemini API Key ([Get one here](https://aistudio.google.com/))

### 1. Backend Setup
```bash
cd app
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Create .env and add GEMINI_API_KEY=your_key
uvicorn main:app --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
# Create .env and add VITE_API_URL=http://localhost:8000
npm run dev
```

### 3. Google Cloud Deployment (Production)
The backend is ready for containerization and deployment to **Google Cloud Run**.
```bash
gcloud run deploy live-agent-backend --source . --env-vars-file .env.yaml
```

## 📐 Architecture
Refer to the `architecture_diagram.md` for a visual flow of how the Gemini Live API connects to the backend services.

## 📄 License
MIT
