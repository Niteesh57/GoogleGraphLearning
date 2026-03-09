from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
import json

from services.gemini_service import gemini_service
from services.embedding_service import embedding_service
from services.umap_service import umap_service
from database.chroma_db import chroma_db

router = APIRouter(prefix="/graph", tags=["graph"])

@router.post("/process-images")
async def process_images(files: List[UploadFile] = File(...)):
    """
    Accepts multiple uploaded images, extracts concepts and relationships, 
    generates embeddings, computes 3D coordinates, and saves them to vector DB.
    """
    print(f"Received request with {len(files)} files")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        image_bytes_list = []
        mimetypes = []
        
        for file in files:
            content = await file.read()
            image_bytes_list.append(content)
            mimetypes.append(file.content_type)
            
        print(f"Processing {len(files)} files with Gemini...")
        # 1. Extraction via Gemini
        extraction = gemini_service.extract_knowledge_graph(image_bytes_list, mimetypes)
        
        if not extraction.nodes:
            return {"status": "success", "message": "No nodes extracted", "data": extraction.dict()}
            
        print(f"Extracted {len(extraction.nodes)} nodes and {len(extraction.edges)} edges.")
        
        # 2. Embeddings Generation
        node_descriptions = [f"{n.label}: {n.description}" for n in extraction.nodes]
        print(f"Generating embeddings for {len(node_descriptions)} nodes...")
        embeddings = embedding_service.generate_embeddings(node_descriptions)
        
        # 3. 3D UMAP mapping
        print(f"Computing 3D coordinates using UMAP...")
        coords = umap_service.compute_3d_coordinates(embeddings)
        
        # 4. Save to ChromaDB
        print(f"Saving to ChromaDB...")
        ids = [n.id for n in extraction.nodes]
        metadatas = [
            {
                "label": n.label,
                "description": n.description,
                "x": float(coords[i][0]) if i < len(coords) else 0.0,
                "y": float(coords[i][1]) if i < len(coords) else 0.0,
                "z": float(coords[i][2]) if i < len(coords) else 0.0,
            }
            for i, n in enumerate(extraction.nodes)
        ]
        
        chroma_db.add_nodes(ids=ids, embeddings=embeddings, metadatas=metadatas, documents=node_descriptions)
        
        # Optionally, save edges somewhere (e.g., SQLite or just return them to the client to render)
        # For this prototype we can just hold edges in memory for the client, 
        # or we could store them in metadata/relational DB.
        
        return {
            "status": "success",
            "message": "Images processed and graph updated.",
            "data": {
                "nodes": metadatas,
                "edges": [e.dict() for e in extraction.edges]
            }
        }
        
    except Exception as e:
        print(f"Error processing images: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nodes")
async def get_all_nodes():
    """
    Returns all nodes currently in the database to render the initial map.
    """
    try:
        data = chroma_db.get_all_nodes()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
