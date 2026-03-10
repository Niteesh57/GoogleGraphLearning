from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
load_dotenv()

from routers import graph, live, knowledge

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

app.include_router(graph.router)
app.include_router(live.router)
app.include_router(knowledge.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Spatial Knowledge Navigator API is running"}
