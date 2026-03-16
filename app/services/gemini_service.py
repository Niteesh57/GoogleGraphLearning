import os
from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Dict, Any
import json

class Node(BaseModel):
    id: str
    label: str
    description: str

class Edge(BaseModel):
    source: str
    target: str
    relationship: str

class GraphExtraction(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class GeminiService:
    def __init__(self):
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=api_key)

    def extract_knowledge_graph(self, image_bytes_list: List[bytes], mimetypes: List[str]) -> GraphExtraction:
        """
        Extracts entities and relationships from a list of images using Gemini.
        """
        prompt = """
        You are an expert knowledge extraction system. Analyze the provided image(s), which may contain screenshots, diagrams, textbook pages, or code snippets.
        
        Task:
        1. Extract all key concepts/entities (Nodes). Give each a unique short ID, a label, and a brief description.
        2. Identify relationships between these concepts (Edges). Specify the source ID, target ID, and a short description of their relationship (e.g., 'powers', 'connects to', 'is a part of').
        
        Output exclusively valid JSON. Do not include markdown formatting like ```json.
        The JSON must match this structure exactly:
        {{
          "nodes": [
            {{"id": "node1", "label": "Concept A", "description": "Details about A"}}
          ],
          "edges": [
            {{"source": "node1", "target": "node2", "relationship": "leads to"}}
          ]
        }}
        """

        contents = []
        for img_bytes, mime in zip(image_bytes_list, mimetypes):
            contents.append(
                types.Part.from_bytes(data=img_bytes, mime_type=mime)
            )
        
        contents.append(prompt)

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash-lite",
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                )
            )
            
            # Parse the JSON response
            extracted_data = json.loads(response.text)
            
            # Convert to Pydantic models for validation
            nodes = [Node(**n) for n in extracted_data.get("nodes", [])]
            edges = [Edge(**e) for e in extracted_data.get("edges", [])]
            
            return GraphExtraction(nodes=nodes, edges=edges)
        except Exception as e:
            print(f"Error parsing Gemini response: {e}")
            # Fallback empty graph on failure
            return GraphExtraction(nodes=[], edges=[])

gemini_service = GeminiService()
