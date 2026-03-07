"""
Verification script to confirm BGE embeddings are being used for search
Run this to verify that search is using BGE model, not OpenAI
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=" * 70)
print("BGE SEARCH VERIFICATION")
print("=" * 70)

# Test 1: Check embedding service configuration
print("\n1. Checking Embedding Service Configuration...")
from services.embeddings import get_embedding_service, EMBEDDING_MODEL_NAME, USE_OPENAI_FALLBACK

print(f"   Model Name: {EMBEDDING_MODEL_NAME}")
print(f"   Use OpenAI Fallback: {USE_OPENAI_FALLBACK}")

embedding_service = get_embedding_service()
print(f"   Loaded Model: {embedding_service.model_name}")
print(f"   Dimension: {embedding_service.dimension}")

if embedding_service.dimension == 1024:
    print("   ✅ PASS: Using 1024 dimensions (BGE model)")
elif embedding_service.dimension == 1536:
    print("   ❌ FAIL: Using 1536 dimensions (OpenAI model)")
    print("   ERROR: Still using OpenAI embeddings!")
else:
    print(f"   ⚠️  WARNING: Unexpected dimension: {embedding_service.dimension}")

# Test 2: Check vector_store configuration
print("\n2. Checking Vector Store Configuration...")
from services.vector_store import EMBEDDING_MODEL, EMBEDDING_DIMENSION

print(f"   Vector Store Model: {EMBEDDING_MODEL}")
print(f"   Vector Store Dimension: {EMBEDDING_DIMENSION}")

if EMBEDDING_DIMENSION == 1024:
    print("   ✅ PASS: Vector store configured for 1024 dimensions")
elif EMBEDDING_DIMENSION == 1536:
    print("   ❌ FAIL: Vector store still configured for 1536 dimensions")
else:
    print(f"   ⚠️  WARNING: Unexpected dimension: {EMBEDDING_DIMENSION}")

# Test 3: Check FAISS index dimension
print("\n3. Checking FAISS Index...")
from pathlib import Path
import faiss

index_path = Path(__file__).parent / "data" / "faiss_index.bin"

if index_path.exists():
    try:
        index = faiss.read_index(str(index_path))
        print(f"   FAISS Index Dimension: {index.d}")
        print(f"   Total Vectors: {index.ntotal}")
        
        if index.d == 1024:
            print("   ✅ PASS: FAISS index is 1024 dimensions (BGE)")
        elif index.d == 1536:
            print("   ❌ FAIL: FAISS index is 1536 dimensions (OpenAI)")
            print("   ACTION REQUIRED: Run reset_vector_index.py to rebuild index")
        else:
            print(f"   ⚠️  WARNING: Unexpected dimension: {index.d}")
    except Exception as e:
        print(f"   ❌ ERROR loading FAISS index: {e}")
else:
    print("   ⚠️  FAISS index not found (will be created on first upload)")

# Test 4: Test embedding generation
print("\n4. Testing Embedding Generation...")
test_text = "Python developer with machine learning experience"
print(f"   Test query: '{test_text}'")

try:
    embedding = embedding_service.embed_single(test_text, normalize=True, use_cache=False)
    print(f"   Generated embedding shape: {embedding.shape}")
    print(f"   Embedding dimension: {embedding.shape[0]}")
    
    if embedding.shape[0] == 1024:
        print("   ✅ PASS: Generated 1024-d embedding (BGE)")
    elif embedding.shape[0] == 1536:
        print("   ❌ FAIL: Generated 1536-d embedding (OpenAI)")
        print("   ERROR: Embedding service is using OpenAI!")
    else:
        print(f"   ⚠️  WARNING: Unexpected dimension: {embedding.shape[0]}")
except Exception as e:
    print(f"   ❌ ERROR generating embedding: {e}")

# Test 5: Check environment variables
print("\n5. Checking Environment Variables...")
import os
from dotenv import load_dotenv

load_dotenv()

embedding_model_env = os.getenv("EMBEDDING_MODEL")
use_openai_env = os.getenv("USE_OPENAI_EMBEDDINGS")

print(f"   EMBEDDING_MODEL: {embedding_model_env}")
print(f"   USE_OPENAI_EMBEDDINGS: {use_openai_env}")

if embedding_model_env == "BAAI/bge-large-en-v1.5":
    print("   ✅ PASS: Environment configured for BGE")
elif embedding_model_env == "text-embedding-3-small":
    print("   ❌ FAIL: Environment configured for OpenAI")
    print("   ACTION REQUIRED: Update .env file")
elif embedding_model_env is None:
    print("   ⚠️  WARNING: EMBEDDING_MODEL not set (using default)")
else:
    print(f"   ℹ️  INFO: Using custom model: {embedding_model_env}")

if use_openai_env == "false":
    print("   ✅ PASS: OpenAI fallback disabled")
elif use_openai_env == "true":
    print("   ❌ FAIL: OpenAI fallback enabled")
    print("   ACTION REQUIRED: Set USE_OPENAI_EMBEDDINGS=false in .env")

# Test 6: Test search functions
print("\n6. Testing Search Functions...")
from services.vector_store import generate_single_embedding

try:
    search_embedding = generate_single_embedding("test query")
    print(f"   Search embedding dimension: {search_embedding.shape[0]}")
    
    if search_embedding.shape[0] == 1024:
        print("   ✅ PASS: Search uses 1024-d embeddings (BGE)")
    elif search_embedding.shape[0] == 1536:
        print("   ❌ FAIL: Search uses 1536-d embeddings (OpenAI)")
        print("   ERROR: Search is still using OpenAI!")
    else:
        print(f"   ⚠️  WARNING: Unexpected dimension: {search_embedding.shape[0]}")
except Exception as e:
    print(f"   ❌ ERROR in search function: {e}")

# Final Summary
print("\n" + "=" * 70)
print("VERIFICATION SUMMARY")
print("=" * 70)

all_pass = True

if embedding_service.dimension != 1024:
    print("❌ Embedding service not using BGE (1024-d)")
    all_pass = False

if EMBEDDING_DIMENSION != 1024:
    print("❌ Vector store not configured for BGE (1024-d)")
    all_pass = False

if index_path.exists():
    try:
        index = faiss.read_index(str(index_path))
        if index.d != 1024:
            print("❌ FAISS index not using BGE dimensions (1024-d)")
            print("   ACTION: Run 'python reset_vector_index.py'")
            all_pass = False
    except:
        pass

if all_pass:
    print("\n✅ ALL CHECKS PASSED!")
    print("   Your system is correctly configured to use BGE embeddings for search.")
    print("   Both upload and search will use BAAI/bge-large-en-v1.5 (1024-d)")
else:
    print("\n❌ SOME CHECKS FAILED!")
    print("   Please review the errors above and take the suggested actions.")
    print("\n   Common fixes:")
    print("   1. Run: python reset_vector_index.py")
    print("   2. Check backend/.env has:")
    print("      EMBEDDING_MODEL=BAAI/bge-large-en-v1.5")
    print("      USE_OPENAI_EMBEDDINGS=false")
    print("   3. Restart the server")

print("=" * 70)
