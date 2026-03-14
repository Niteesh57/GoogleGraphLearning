from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from dotenv import load_dotenv

# Configure logging to write to both console and a file
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("gemini_errors.log", mode='a'),
        logging.StreamHandler()
    ]
)

# Load .env BEFORE importing routers to ensure Gemini Services get the API key
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

from app.routers import graph, live, knowledge

app = FastAPI(title="Spatial Knowledge Navigator API")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"DEBUG: Validation Error for {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(".generated_videos", exist_ok=True)

# NOTE: FastAPI's StaticFiles bypasses CORSMiddleware, so video resources
# would be cross-origin-tainted in the browser canvas (can't call toDataURL).
# We serve them via an explicit route to ensure CORS headers are always set.
from fastapi.responses import FileResponse

@app.get("/videos/{filename}")
async def serve_video(filename: str):
    """Serve generated videos with explicit CORS headers for canvas capture."""
    video_path = os.path.join(".generated_videos", filename)
    if not os.path.exists(video_path):
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Video not found"}, status_code=404)
    return FileResponse(
        video_path,
        media_type="video/mp4",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
        }
    )

app.include_router(graph.router)
app.include_router(live.router)
app.include_router(knowledge.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Spatial Knowledge Navigator API is running"}
