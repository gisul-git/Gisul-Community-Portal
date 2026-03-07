"""
Performance test for BGE embeddings
Measures embedding generation speed
"""
import time
from services.embeddings import get_embedding_service
import numpy as np

print("=" * 60)
print("Performance Test - BGE Embeddings")
print("=" * 60)

print("\n0. Loading embedding service...")
start_load = time.time()
embedding_service = get_embedding_service()
end_load = time.time()
print(f"   Model: {embedding_service.model_name}")
print(f"   Dimension: {embedding_service.dimension}")
print(f"   Load time: {(end_load-start_load)*1000:.2f}ms")

# Test single embedding speed
print("\n1. Single embedding speed test...")
text = "Python developer with machine learning experience"
start = time.time()
embedding = embedding_service.embed_single(text)
end = time.time()
single_time = (end-start)*1000
print(f"   Time: {single_time:.2f}ms")
print(f"   Dimension: {embedding.shape[0]}")

# Test batch embedding speed (small batch)
print("\n2. Small batch embedding test (10 texts)...")
texts = [f"Test text number {i} with some content" for i in range(10)]
start = time.time()
embeddings = embedding_service.embed(texts)
end = time.time()
batch_time = (end-start)*1000
print(f"   Total time: {batch_time:.2f}ms")
print(f"   Per text: {batch_time/10:.2f}ms")
print(f"   Shape: {embeddings.shape}")

# Test larger batch
print("\n3. Large batch embedding test (50 texts)...")
texts = [f"Test text number {i} with some content" for i in range(50)]
start = time.time()
embeddings = embedding_service.embed(texts)
end = time.time()
large_batch_time = (end-start)*1000
print(f"   Total time: {large_batch_time:.2f}ms")
print(f"   Per text: {large_batch_time/50:.2f}ms")
print(f"   Shape: {embeddings.shape}")

# Performance evaluation
print("\n4. Performance evaluation:")
if single_time < 100:
    print(f"   ✅ EXCELLENT: Single embedding in {single_time:.2f}ms")
elif single_time < 200:
    print(f"   ✅ GOOD: Single embedding in {single_time:.2f}ms")
else:
    print(f"   ⚠️  SLOW: Single embedding in {single_time:.2f}ms")
    print("   Consider GPU acceleration or smaller model")

avg_batch = batch_time / 10
if avg_batch < 50:
    print(f"   ✅ EXCELLENT: Batch average {avg_batch:.2f}ms per text")
elif avg_batch < 100:
    print(f"   ✅ GOOD: Batch average {avg_batch:.2f}ms per text")
else:
    print(f"   ⚠️  SLOW: Batch average {avg_batch:.2f}ms per text")

# Check GPU availability
print("\n5. Hardware check:")
try:
    import torch
    if torch.cuda.is_available():
        print(f"   ✅ GPU available: {torch.cuda.get_device_name(0)}")
        print(f"   GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f}GB")
    else:
        print("   ℹ️  GPU not available (using CPU)")
        print("   Tip: Install PyTorch with CUDA for faster embeddings")
except ImportError:
    print("   ℹ️  PyTorch not available for GPU check")

print("\n" + "=" * 60)
print("✅ Performance test complete!")
print("=" * 60)
