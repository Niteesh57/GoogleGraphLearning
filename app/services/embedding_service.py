import os
from google import genai
from typing import List

class EmbeddingService:
    def __init__(self):
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=api_key)

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generates embeddings for a list of strings using text-embedding-004.
        """
        if not texts:
            return []
            
        try:
            response = self.client.models.embed_content(
                model="gemini-embedding-001",
                contents=texts,
            )
            return [embedding.values for embedding in response.embeddings]
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            return []

embedding_service = EmbeddingService()
