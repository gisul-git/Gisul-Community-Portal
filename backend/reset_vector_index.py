"""
Script to reset FAISS vector index when switching embedding models.
This is necessary when changing from one embedding dimension to another.

Run this script after changing EMBEDDING_MODEL in .env file.
"""
import os
from pathlib import Path
import shutil

# Path to data directory
DATA_DIR = Path(__file__).parent / "data"
FAISS_INDEX_PATH = DATA_DIR / "faiss_index.bin"
VECTOR_STORE_PATH = DATA_DIR / "vector_store.pkl"
REINDEX_VERSION_PATH = DATA_DIR / ".reindex_version"

def reset_vector_index():
    """Delete old FAISS index files to force rebuild with new embedding model."""
    print("🔄 Resetting vector index for new embedding model...")
    
    files_deleted = []
    
    # Delete FAISS index
    if FAISS_INDEX_PATH.exists():
        os.remove(FAISS_INDEX_PATH)
        files_deleted.append(str(FAISS_INDEX_PATH))
        print(f"✅ Deleted: {FAISS_INDEX_PATH}")
    
    # Delete vector store
    if VECTOR_STORE_PATH.exists():
        os.remove(VECTOR_STORE_PATH)
        files_deleted.append(str(VECTOR_STORE_PATH))
        print(f"✅ Deleted: {VECTOR_STORE_PATH}")
    
    # Update reindex version to force re-embedding
    if REINDEX_VERSION_PATH.exists():
        with open(REINDEX_VERSION_PATH, 'r') as f:
            current_version = f.read().strip()
        new_version = str(int(current_version) + 1)
    else:
        new_version = "1"
    
    with open(REINDEX_VERSION_PATH, 'w') as f:
        f.write(new_version)
    print(f"✅ Updated reindex version: {new_version}")
    
    if files_deleted:
        print(f"\n✅ Successfully reset vector index!")
        print(f"   Deleted {len(files_deleted)} file(s)")
        print(f"\n⚠️  IMPORTANT: You must now re-index all documents:")
        print(f"   1. Start your backend server")
        print(f"   2. All existing embeddings will be regenerated with the new model")
        print(f"   3. This may take some time depending on the number of documents")
    else:
        print("\nℹ️  No index files found. Starting fresh.")
    
    print(f"\n📊 New embedding model will be: {os.getenv('EMBEDDING_MODEL', 'BAAI/bge-large-en-v1.5')}")
    print(f"   Dimension: 1024")

if __name__ == "__main__":
    reset_vector_index()
