from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from pydantic import BaseModel
from app.services.knowledge_service import knowledge_engine

router = APIRouter(prefix="/api", tags=["knowledge"])

class TextInput(BaseModel):
    text: str

class NodeInput(BaseModel):
    nodeId: str

@router.post("/text-concepts")
async def process_text_concepts(data: TextInput):
    try:
        concepts = knowledge_engine.extract_concepts(data.text)
        knowledge_engine.update_graph(concepts)
        return {"status": "added"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-pdf")
async def process_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        content = await file.read()
        text = knowledge_engine.extract_text_from_pdf(content)
        concepts = knowledge_engine.extract_concepts(text)
        knowledge_engine.update_graph(concepts)
        return {"status": "added"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/graph-state")
async def get_graph_state():
    try:
        return knowledge_engine.get_graph_state()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/explain-node")
async def explain_node(data: NodeInput):
    try:
        explanation = knowledge_engine.explain_node(data.nodeId)
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/explain-node-voice")
async def explain_node_voice(audio: UploadFile = File(...), nodeId: str = Form(...)):
    try:
        audio_bytes = await audio.read()
        explanation = knowledge_engine.explain_node_voice(nodeId, audio_bytes, audio.content_type)
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
