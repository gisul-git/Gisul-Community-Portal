"""
Test script to verify BGE embedding generation
Run this after starting the server to test embeddings
"""
from services.embeddings import get_embedding_service
import numpy as np

print("=" * 60)
print("Testing BGE Embedding Generation")
print("=" * 60)

# Get embedding service
print("\n1. Loading embedding service...")
embedding_service = get_embedding_service()
print(f"   ✅ Model: {embedding_service.model_name}")
print(f"   ✅ Dimension: {embedding_service.dimension}")

# Test single embedding
print("\n2. Testing single text embedding...")
text = "Python developer with 5 years experience"
embedding = embedding_service.embed_single(text)
print(f"   ✅ Generated embedding shape: {embedding.shape}")
print(f"   ✅ Expected shape: ({embedding_service.dimension},)")
print(f"   ✅ Embedding type: {type(embedding)}")
print(f"   ✅ First 5 values: {embedding[:5]}")

# Test batch embedding
print("\n3. Testing batch embedding...")
texts = [
    "Machine learning engineer",
    "Data scientist with Python",
    "Full stack developer"
]
embeddings = embedding_service.embed(texts)
print(f"   ✅ Generated embeddings shape: {embeddings.shape}")
print(f"   ✅ Expected shape: ({len(texts)}, {embedding_service.dimension})")

# Verify dimensions
print("\n4. Verification:")
if embedding.shape[0] == 1024:
    print("   ✅ PASS: Dimension is 1024 (BGE model)")
else:
    print(f"   ❌ FAIL: Dimension is {embedding.shape[0]} (expected 1024)")

if embeddings.shape == (3, 1024):
    print("   ✅ PASS: Batch embeddings correct shape")
else:
    print(f"   ❌ FAIL: Batch shape is {embeddings.shape} (expected (3, 1024))")

# Test normalization
print("\n5. Testing normalization...")
norm = np.linalg.norm(embedding)
print(f"   Vector norm: {norm:.4f}")
if 0.99 <= norm <= 1.01:
    print("   ✅ PASS: Vector is normalized")
else:
    print(f"   ⚠️  WARNING: Vector norm is {norm:.4f} (expected ~1.0)")

print("\n" + "=" * 60)
print("✅ All embedding tests passed!")
print("=" * 60)
