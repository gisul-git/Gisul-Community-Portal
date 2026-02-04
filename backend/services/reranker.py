"""
Cross-Encoder Reranker Service
Uses BAAI/bge-reranker-v2-m3 for high-quality reranking.
"""
import logging
import os
import hashlib
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Reranker configuration
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
USE_RERANKER = os.getenv("USE_RERANKER", "true").lower() == "true"

# Cache configuration
RERANKER_CACHE: Dict[str, Tuple[float, datetime]] = {}
MAX_CACHE_ENTRIES = 5000
CACHE_TTL_HOURS = 24 * 3  # 3 days


class RerankerService:
    """Service for reranking search results using cross-encoder."""
    
    def __init__(self, model_name: str = None):
        """
        Initialize reranker service.
        
        Args:
            model_name: Reranker model to use
        """
        self.model_name = model_name or RERANKER_MODEL_NAME
        self.model = None
        self.tokenizer = None
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize the reranker model."""
        if not USE_RERANKER:
            logger.info("⚠️ Reranker disabled via USE_RERANKER=false")
            return
        
        try:
            from FlagEmbedding import FlagReranker
            logger.info(f"🔄 Loading reranker model: {self.model_name}")
            self.model = FlagReranker(self.model_name, use_fp16=True)
            logger.info(f"✅ Loaded reranker model: {self.model_name}")
        except ImportError:
            # Reranker is optional - only log once at startup, not as warning
            if not hasattr(self, '_import_warning_logged'):
                logger.info("ℹ️ Reranker disabled (FlagEmbedding not installed). Install with: pip install FlagEmbedding")
                self._import_warning_logged = True
            self.model = None
        except Exception as e:
            logger.warning(f"⚠️ Failed to load reranker model: {e}")
            logger.warning("⚠️ Continuing without reranker")
            self.model = None
    
    def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: Optional[int] = None,
        use_cache: bool = True
    ) -> List[Tuple[int, float]]:
        """
        Rerank documents based on query relevance.
        
        Args:
            query: Search query
            documents: List of document texts to rerank
            top_k: Number of top results to return (None = all)
            use_cache: Whether to use cached scores
        
        Returns:
            List of (index, score) tuples sorted by score (highest first)
        """
        if not self.model or not documents:
            # Return original order if reranker unavailable
            return [(i, 0.0) for i in range(len(documents))]
        
        if not query or not query.strip():
            return [(i, 0.0) for i in range(len(documents))]
        
        # Prepare query-document pairs
        pairs = [(query, doc) for doc in documents]
        
        # Check cache for each pair
        cached_scores = {}
        pairs_to_rerank = []
        pair_indices = []
        
        for idx, (q, doc) in enumerate(pairs):
            if use_cache:
                cached = self._get_cached_score(query, doc)
                if cached is not None:
                    cached_scores[idx] = cached
                    continue
            
            pairs_to_rerank.append((q, doc))
            pair_indices.append(idx)
        
        # Rerank cache misses
        new_scores = {}
        if pairs_to_rerank:
            try:
                # Batch rerank
                scores = self.model.compute_score(pairs_to_rerank, normalize=True)
                
                # Handle different return types
                if isinstance(scores, (list, np.ndarray)):
                    scores_list = scores.tolist() if isinstance(scores, np.ndarray) else scores
                else:
                    # Single score
                    scores_list = [float(scores)]
                
                # Store scores and cache
                for (q, doc), score in zip(pairs_to_rerank, scores_list):
                    idx = pair_indices[pairs_to_rerank.index((q, doc))]
                    score_float = float(score)
                    new_scores[idx] = score_float
                    if use_cache:
                        self._cache_score(q, doc, score_float)
            except Exception as e:
                logger.warning(f"⚠️ Reranking failed: {e}")
                # Fallback: return original order
                for idx in pair_indices:
                    new_scores[idx] = 0.0
        
        # Combine cached and new scores
        all_scores = []
        for idx in range(len(documents)):
            if idx in cached_scores:
                all_scores.append((idx, cached_scores[idx]))
            elif idx in new_scores:
                all_scores.append((idx, new_scores[idx]))
            else:
                all_scores.append((idx, 0.0))
        
        # Sort by score (highest first)
        all_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Return top_k if specified
        if top_k is not None:
            return all_scores[:top_k]
        
        return all_scores
    
    def rerank_chunks(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: Optional[int] = None,
        use_cache: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Rerank chunk results.
        
        Args:
            query: Search query
            chunks: List of chunk dicts with 'text' and 'metadata' keys
            top_k: Number of top results to return
            use_cache: Whether to use cached scores
        
        Returns:
            List of reranked chunks with added 'rerank_score' field
        """
        if not chunks:
            return []
        
        # Extract texts for reranking
        texts = [chunk.get("text", "") for chunk in chunks]
        
        # Rerank
        reranked_indices = self.rerank(query, texts, top_k=top_k, use_cache=use_cache)
        
        # Build reranked results
        reranked_chunks = []
        for idx, score in reranked_indices:
            chunk = chunks[idx].copy()
            chunk["rerank_score"] = score
            reranked_chunks.append(chunk)
        
        return reranked_chunks
    
    def _get_cached_score(self, query: str, document: str) -> Optional[float]:
        """Get cached reranker score if available."""
        cache_key = self._make_cache_key(query, document)
        
        if cache_key in RERANKER_CACHE:
            score, timestamp = RERANKER_CACHE[cache_key]
            if datetime.utcnow() - timestamp < timedelta(hours=CACHE_TTL_HOURS):
                return score
            else:
                del RERANKER_CACHE[cache_key]
        
        return None
    
    def _cache_score(self, query: str, document: str, score: float):
        """Cache a reranker score."""
        cache_key = self._make_cache_key(query, document)
        RERANKER_CACHE[cache_key] = (score, datetime.utcnow())
        
        # Cleanup old entries
        if len(RERANKER_CACHE) > MAX_CACHE_ENTRIES:
            sorted_items = sorted(RERANKER_CACHE.items(), key=lambda x: x[1][1])
            for key, _ in sorted_items[:len(RERANKER_CACHE) - MAX_CACHE_ENTRIES]:
                del RERANKER_CACHE[key]
    
    def _make_cache_key(self, query: str, document: str) -> str:
        """Create cache key from query and document."""
        combined = f"{query}|||{document}"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()


# Global reranker service instance
_reranker_service: Optional[RerankerService] = None


def get_reranker_service() -> RerankerService:
    """Get or create global reranker service instance."""
    global _reranker_service
    if _reranker_service is None:
        _reranker_service = RerankerService()
    return _reranker_service


def clear_reranker_cache():
    """Clear the reranker cache."""
    global RERANKER_CACHE
    cache_size = len(RERANKER_CACHE)
    RERANKER_CACHE.clear()
    logger.info(f"🗑️ Cleared reranker cache ({cache_size} entries)")

