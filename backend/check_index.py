"""
Check FAISS index dimension and status
Run this to verify the FAISS index is using correct dimensions
"""
import faiss
from pathlib import Path

print("=" * 60)
print("FAISS Index Verification")
print("=" * 60)

index_path = Path(__file__).parent / "data" / "faiss_index.bin"
store_path = Path(__file__).parent / "data" / "vector_store.pkl"

print("\n1. Checking files...")
if index_path.exists():
    print(f"   ✅ FAISS index found: {index_path}")
else:
    print(f"   ❌ FAISS index NOT found: {index_path}")
    print("   Run the server and upload documents to create index")
    exit(1)

if store_path.exists():
    print(f"   ✅ Vector store found: {store_path}")
else:
    print(f"   ⚠️  Vector store NOT found: {store_path}")

print("\n2. Loading FAISS index...")
try:
    index = faiss.read_index(str(index_path))
    print(f"   ✅ FAISS index loaded successfully")
except Exception as e:
    print(f"   ❌ Failed to load index: {e}")
    exit(1)

print("\n3. Index information:")
print(f"   Dimension: {index.d}")
print(f"   Total vectors: {index.ntotal}")
print(f"   Index type: {type(index).__name__}")

print("\n4. Verification:")
if index.d == 1024:
    print("   ✅ PASS: Index dimension is 1024 (BGE model)")
elif index.d == 1536:
    print("   ❌ FAIL: Index dimension is 1536 (OpenAI model)")
    print("   Action required: Run reset_vector_index.py")
else:
    print(f"   ❌ FAIL: Index dimension is {index.d} (unexpected)")

if index.ntotal > 0:
    print(f"   ✅ PASS: Index contains {index.ntotal} vectors")
else:
    print("   ⚠️  WARNING: Index is empty (no documents indexed yet)")

print("\n" + "=" * 60)
if index.d == 1024:
    print("✅ FAISS index verification passed!")
else:
    print("❌ FAISS index verification failed!")
print("=" * 60)
