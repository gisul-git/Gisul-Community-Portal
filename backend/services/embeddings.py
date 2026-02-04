"""
Multi-Vector Embedding Service
Supports multiple embedding models with caching and batch processing.
"""
import logging
import os
import hashlib
import numpy as np
from typing import List, Optional, Dict, Tuple, Any
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Embedding model configuration
# Default to OpenAI embeddings (most reliable and doesn't require local model downloads)
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")  # Default to OpenAI
EMBEDDING_DIMENSION = None  # Will be set based on model
USE_OPENAI_FALLBACK = os.getenv("USE_OPENAI_EMBEDDINGS", "true").lower() == "true"  # Default to true

# Cache configuration - Optimized for performance
EMBEDDING_CACHE: Dict[str, Tuple[np.ndarray, datetime]] = {}
MAX_CACHE_ENTRIES = 10000  # Already optimized
CACHE_TTL_HOURS = 24 * 30  # 30 days (embeddings don't change, longer cache = better performance)


class EmbeddingService:
    """Service for generating embeddings using various models."""
    
    def __init__(self, model_name: str = None):
        """
        Initialize embedding service.
        
        Args:
            model_name: Model to use (text-embedding-3-small for OpenAI, or sentence-transformers models)
        """
        self.model_name = model_name or EMBEDDING_MODEL_NAME
        self.model = None
        self.tokenizer = None
        self.dimension = None
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize the embedding model."""
        try:
            if self.model_name.startswith("text-embedding") or USE_OPENAI_FALLBACK:
                # Use OpenAI embeddings
                from openai import OpenAI
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY not set")
                self.client = OpenAI(api_key=api_key)
                self.model_name = "text-embedding-3-small"  # Default OpenAI model
                self.dimension = 1536
                logger.info(f"✅ Initialized OpenAI embedding model: {self.model_name} ({self.dimension}D)")
            else:
                # Use sentence-transformers for local models (FlagEmbedding removed)
                try:
                    # Use sentence-transformers for other models
                    from sentence_transformers import SentenceTransformer
                    logger.info(f"🔄 Loading SentenceTransformer model: {self.model_name}")
                    self.model = SentenceTransformer(self.model_name)
                    self.dimension = self.model.get_sentence_embedding_dimension()
                    logger.info(f"✅ Loaded SentenceTransformer model: {self.model_name} ({self.dimension}D)")
                except (ImportError, ValueError, ModuleNotFoundError) as e:
                    # Fallback to OpenAI if local models not available
                    logger.info(f"ℹ️ Local embedding model not available, using OpenAI embeddings")
                    from openai import OpenAI
                    api_key = os.getenv("OPENAI_API_KEY")
                    if not api_key:
                        raise ValueError("OPENAI_API_KEY not set and embedding libraries unavailable")
                    self.client = OpenAI(api_key=api_key)
                    self.model_name = "text-embedding-3-small"
                    self.dimension = 1536
                    self.model = None
        except Exception as e:
            logger.error(f"❌ Failed to initialize embedding model: {e}")
            raise
    
    def embed(self, texts: List[str], normalize: bool = True, use_cache: bool = True) -> np.ndarray:
        """
        Generate embeddings for a list of texts.
        
        Args:
            texts: List of text strings to embed
            normalize: Whether to L2-normalize embeddings
            use_cache: Whether to use cached embeddings
        
        Returns:
            numpy array of shape (len(texts), dimension)
        """
        if not texts:
            return np.array([])
        
        # Check cache for each text
        cached_embeddings = {}
        texts_to_embed = []
        text_indices = []
        
        for idx, text in enumerate(texts):
            if not text or not text.strip():
                continue
            
            if use_cache:
                cached = self._get_cached_embedding(text)
                if cached is not None:
                    cached_embeddings[idx] = cached
                    continue
            
            texts_to_embed.append(text)
            text_indices.append(idx)
        
        # Generate embeddings for cache misses
        new_embeddings = {}
        if texts_to_embed:
            if self.model is not None:
                # Use local model (sentence-transformers)
                embeddings = self.model.encode(texts_to_embed, normalize_embeddings=normalize)
                
                if isinstance(embeddings, np.ndarray):
                    embeddings_array = embeddings
                else:
                    embeddings_array = np.array(embeddings)
                
                # Cache and store
                for text, embedding in zip(texts_to_embed, embeddings_array):
                    idx = text_indices[texts_to_embed.index(text)]
                    if normalize and not self._is_normalized(embedding):
                        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
                    new_embeddings[idx] = embedding
                    if use_cache:
                        self._cache_embedding(text, embedding)
            else:
                # Use OpenAI API
                from openai import OpenAI
                if not hasattr(self, 'client'):
                    api_key = os.getenv("OPENAI_API_KEY")
                    self.client = OpenAI(api_key=api_key)
                
                # Batch API call
                response = self.client.embeddings.create(
                    model=self.model_name,
                    input=texts_to_embed
                )
                
                for text, embedding_data in zip(texts_to_embed, response.data):
                    idx = text_indices[texts_to_embed.index(text)]
                    embedding = np.array(embedding_data.embedding, dtype=np.float32)
                    if normalize:
                        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
                    new_embeddings[idx] = embedding
                    if use_cache:
                        self._cache_embedding(text, embedding)
        
        # Combine cached and new embeddings in correct order
        result = []
        for idx in range(len(texts)):
            if idx in cached_embeddings:
                result.append(cached_embeddings[idx])
            elif idx in new_embeddings:
                result.append(new_embeddings[idx])
            else:
                # Empty text - use zero vector
                result.append(np.zeros(self.dimension, dtype=np.float32))
        
        return np.array(result)
    
    def embed_single(self, text: str, normalize: bool = True, use_cache: bool = True) -> np.ndarray:
        """Generate embedding for a single text."""
        if not text or not text.strip():
            return np.zeros(self.dimension, dtype=np.float32)
        
        embeddings = self.embed([text], normalize=normalize, use_cache=use_cache)
        return embeddings[0] if len(embeddings) > 0 else np.zeros(self.dimension, dtype=np.float32)
    
    def _get_cached_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get cached embedding if available and not expired."""
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        
        if text_hash in EMBEDDING_CACHE:
            embedding, timestamp = EMBEDDING_CACHE[text_hash]
            age = datetime.utcnow() - timestamp
            if age < timedelta(hours=CACHE_TTL_HOURS):
                logger.debug(f"✅ Cache HIT for text (hash: {text_hash[:8]}..., age: {age})")
                return embedding
            else:
                # Expired - remove from cache
                del EMBEDDING_CACHE[text_hash]
                logger.debug(f"⏰ Cache EXPIRED for text (hash: {text_hash[:8]}..., age: {age})")
        
        logger.debug(f"❌ Cache MISS for text (hash: {text_hash[:8]}...)")
        return None
    
    def _cache_embedding(self, text: str, embedding: np.ndarray):
        """Cache an embedding."""
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        EMBEDDING_CACHE[text_hash] = (embedding, datetime.utcnow())
        logger.debug(f"💾 Cached embedding for text (hash: {text_hash[:8]}..., cache size: {len(EMBEDDING_CACHE)})")
        
        # Cleanup old entries if cache is too large
        if len(EMBEDDING_CACHE) > MAX_CACHE_ENTRIES:
            sorted_items = sorted(EMBEDDING_CACHE.items(), key=lambda x: x[1][1])
            removed = len(EMBEDDING_CACHE) - MAX_CACHE_ENTRIES
            for key, _ in sorted_items[:removed]:
                del EMBEDDING_CACHE[key]
            logger.info(f"🧹 Cleaned up {removed} old cache entries (cache size now: {len(EMBEDDING_CACHE)})")
    
    def _is_normalized(self, vec: np.ndarray) -> bool:
        """Check if vector is normalized."""
        norm = np.linalg.norm(vec)
        return abs(norm - 1.0) < 1e-5
    
    def get_dimension(self) -> int:
        """Get embedding dimension."""
        return self.dimension


# Global embedding service instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


def reset_embedding_service():
    """Reset the global embedding service instance (useful after API key changes)."""
    global _embedding_service
    _embedding_service = None
    logger.info("🔄 Reset embedding service instance (will be recreated on next use)")


def clear_embedding_cache():
    """Clear the embedding cache."""
    global EMBEDDING_CACHE
    cache_size = len(EMBEDDING_CACHE)
    EMBEDDING_CACHE.clear()
    logger.info(f"🗑️ Cleared embedding cache ({cache_size} entries)")
    logger.warning("⚠️ Cache cleared - this will slow down subsequent searches until cache rebuilds")

