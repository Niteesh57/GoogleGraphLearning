import chromadb
from typing import List, Dict, Any
import os

class ChromaDBService:
    def __init__(self):
        # Initialize persistent client
        db_path = os.path.join(os.path.dirname(__file__), "..", "chroma_data")
        self.client = chromadb.PersistentClient(path=db_path)
        
        # Get or create collection
        self.collection_name = "knowledge_nodes"
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"}
        )

    def add_nodes(self, ids: List[str], embeddings: List[List[float]], metadatas: List[Dict[str, Any]], documents: List[str]):
        """
        Add or update nodes in the vector database.
        """
        if not ids:
            return
            
        self.collection.upsert(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    def search_nodes(self, query_embeddings: List[List[float]], n_results: int = 5) -> Dict[str, Any]:
        """
        Search for the most relevant nodes based on query embedding.
        """
        results = self.collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )
        return results

    def get_all_nodes(self) -> Dict[str, Any]:
        """
        Retrieve all nodes (up to a limit) to render the full graph.
        """
        return self.collection.get()
        
chroma_db = ChromaDBService()
