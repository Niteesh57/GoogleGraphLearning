import networkx as nx
import json
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine
from io import BytesIO
from pdfminer.high_level import extract_text
from google import genai
from pydantic import BaseModel, Field
from typing import List
import os

class Edge(BaseModel):
    source: str
    target: str
    relation: str

class KnowledgeGraphSchema(BaseModel):
    nodes: List[str]
    edges: List[Edge]

class KnowledgeEngine:
    def __init__(self):
        self.G = nx.Graph()
        # Ensure we have our model loaded for embedding similarity
        self.embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        text = extract_text(BytesIO(pdf_bytes))
        return text

    def extract_concepts(self, text: str) -> dict:
        prompt = f"""
        Analyze the following text and extract:
        1) Key concepts (as nodes)
        2) Relationships between them (as edges)

        Text:
        {text}
        """
        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': KnowledgeGraphSchema,
            },
        )
        return json.loads(response.text)

    def _embed(self, text: str):
        return self.embed_model.encode(text)

    def _merge_node(self, new_node: str) -> str:
        """Finds if a semantically similar node exists in the graph and returns it, else returns new_node."""
        if not self.G.nodes:
            return new_node
            
        new_emb = self._embed(new_node)
        for existing_node in self.G.nodes:
            existing_emb = self._embed(existing_node)
            # cosine() returns distance. Similarity = 1 - distance.
            sim = 1 - cosine(new_emb, existing_emb)
            if sim > 0.85:
                return existing_node
        return new_node

    def update_graph(self, concepts: dict):
        # Merge and add nodes
        node_mapping = {} # maps the extracted node name to the canonical (merged) node name in the graph
        for node in concepts.get("nodes", []):
            merged_name = self._merge_node(node)
            node_mapping[node] = merged_name
            if merged_name not in self.G:
                self.G.add_node(merged_name, group=1) # Default group

        # Add edges
        for edge in concepts.get("edges", []):
            src = node_mapping.get(edge["source"], self._merge_node(edge["source"]))
            tgt = node_mapping.get(edge["target"], self._merge_node(edge["target"]))
            
            if src not in self.G:
                self.G.add_node(src, group=1)
            if tgt not in self.G:
                self.G.add_node(tgt, group=1)
                
            self.G.add_edge(src, tgt, label=edge["relation"])

    def get_graph_state(self):
        return {
            "nodes": [{"id": n, "group": self.G.nodes[n].get("group", 1)} for n in self.G.nodes],
            "links": [
                {"source": u, "target": v, "label": data.get("label", "")}
                for u, v, data in self.G.edges(data=True)
            ]
        }

    def explain_node(self, node_id: str) -> str:
        if node_id not in self.G:
            return "Node not found in graph."
            
        neighbors = list(self.G.neighbors(node_id))
        
        prompt = f"""
        User is exploring a knowledge graph.
        
        Current focused node:
        {node_id}
        
        Connected nodes:
        {', '.join(neighbors)}
        
        Explain the concept "{node_id}" and how it connects to these related concepts.
        """
        response = self.client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text

    def explain_node_voice(self, node_id: str, audio_bytes: bytes,  mime_type: str = "audio/webm") -> str:
        if node_id not in self.G:
            return "Node not found in graph."
            
        neighbors = list(self.G.neighbors(node_id))
        
        # Determine paths and connections for a richer prompt
        prompt = f"""
        User is exploring a knowledge graph and asking a question via Voice.
        
        Current focused node:
        {node_id}
        
        Connected nodes:
        {', '.join(neighbors)}
        
        Listen to the user's voice question and answer it specifically in the context of "{node_id}" and its related concepts above.
        Keep the answer concise, conversational, and directly address their audio query.
        """
        
        try:
            # For Gemini 1.5/2.5 audio processing, we pass the bytes directly 
            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    prompt, 
                    {"mime_type": mime_type, "data": audio_bytes}
                ]
            )
            return response.text
        except Exception as e:
            print(f"Error processing audio with Gemini: {e}")
            return "Sorry, I had trouble understanding or processing the audio."

# Singleton instance
knowledge_engine = KnowledgeEngine()
