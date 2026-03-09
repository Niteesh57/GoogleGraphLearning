import umap
import numpy as np
from typing import List, Tuple

class UmapService:
    def __init__(self):
        pass

    def compute_3d_coordinates(self, embeddings: List[List[float]]) -> List[List[float]]:
        """
        Takes a list of high-dimensional embeddings and reduces them to 3D (x, y, z) coordinates using UMAP.
        """
        if not embeddings:
            return []
            
        n_samples = len(embeddings)
        n_components = 3
        
        # UMAP requires n_neighbors <= n_samples. 
        # For very small graphs (e.g., < 15 nodes), we need to adjust n_neighbors to avoid errors.
        n_neighbors = min(15, n_samples - 1) if n_samples > 1 else 1
        
        if n_samples <= n_components:
            # If we have very few nodes, UMAP projection might be trivial or error out.
            # We can just return random or somewhat spaced out coordinates.
            coords = np.random.rand(n_samples, n_components) * 10
            return coords.tolist()

        reducer = umap.UMAP(
            n_neighbors=n_neighbors,
            n_components=n_components,
            metric='cosine',
            random_state=42 # for reproducibility
        )
        
        projected = reducer.fit_transform(embeddings)
        return projected.tolist()

umap_service = UmapService()
