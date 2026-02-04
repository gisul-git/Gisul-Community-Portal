# Gisul AI Resume Portal - Project Flow Documentation

## Overview
This is an AI-powered Resume Portal system that enables:
- **Admin users** to bulk upload and manage trainer resumes
- **Trainers** to upload their own resumes
- **Customers** to search for trainers based on job descriptions or text queries
- Intelligent resume parsing using OpenAI GPT models
- Vector-based semantic search using FAISS
- Resume storage and retrieval from MongoDB

---

## Project Architecture

### Technology Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React (Vite)
- **Database**: MongoDB (Motor - Async MongoDB driver)
- **Task Queue**: Celery (for async processing)
- **Vector Search**: FAISS (Facebook AI Similarity Search)
- **AI/ML**: OpenAI GPT-4o-mini for parsing, text-embedding-3-small for embeddings
- **Storage**: MongoDB for structured data, FAISS for vector embeddings

### Key Components
1. **API Layer** (`backend/api/main.py`) - REST endpoints
2. **Services** (`backend/services/`) - Business logic
   - `extract_text.py` - Text extraction from various file formats
   - `parse_service.py` - AI-powered resume parsing
   - `vector_store.py` - Vector embeddings and similarity search
   - `embeddings.py` - OpenAI embedding generation
3. **Tasks** (`backend/tasks/tasks.py`) - Celery async tasks
4. **Models** (`backend/models/models.py`) - Pydantic models
5. **Frontend** (`frontend/src/`) - React components

---

## 1. RESUME UPLOAD FLOW

### A. Admin Bulk Upload Flow

#### Step 1: Frontend Upload (`frontend/src/pages/BulkUpload.jsx`)
```
User selects multiple files (PDF, DOC, DOCX, JPG, PNG) 
    ↓
Files are stored in React state
    ↓
User clicks "Start Upload" button
    ↓
Calls startBulkUpload() from api.js
```

#### Step 2: API Endpoint (`backend/api/main.py` - `/admin/bulk_upload_start`)
```python
POST /admin/bulk_upload_start
- Receives multiple UploadFile objects
- Processes files in parallel (async)
- Base64 encodes each file
- Creates payload: [{filename, content_b64}, ...]
- Queues Celery task: bulk_import_task.delay(payload, admin_email)
- Returns: {task_id: "..."}
- Logs activity (non-blocking)
```

#### Step 3: Celery Task Queuing
- Task is queued to Celery worker
- Returns immediately to frontend (non-blocking)
- Frontend receives `task_id`

#### Step 4: Frontend Polling (`BulkUpload.jsx`)
```
Frontend polls /tasks/{task_id} every 2.5 seconds
    ↓
Shows progress: PENDING → PROGRESS → SUCCESS/FAILURE
    ↓
Displays real-time progress (X/Y files processed)
```

---

### B. Celery Task Processing (`backend/tasks/tasks.py`)

#### Task: `bulk_import_task`
```python
@cel.task(bind=True, name="tasks.bulk_import_task")
def bulk_import_task(self, files_payload, uploaded_by_admin)
```

**Processing Steps:**

1. **Parallel Processing**
   - Uses `ThreadPoolExecutor(max_workers=4)` for concurrent processing
   - Each file processed by `process_resume_entry()`

2. **Per-File Processing** (`process_resume_entry()`):
   
   **a) File Decoding:**
   ```python
   original_bytes = base64.b64decode(content_b64)
   ```
   
   **b) Format Conversion (if needed):**
   ```python
   If file is .doc/.docx:
       - Convert to PDF using LibreOffice (soffice)
       - Store as PDF in database
   ```
   
   **c) Text Extraction** (`services/extract_text.py`):
   ```python
   text = extract_text_from_bytes(filename, file_bytes)
   ```
   - **PDF**: Uses `pdfplumber` for standard PDFs, OCR (Tesseract) for scanned PDFs
   - **DOC/DOCX**: Converts to PDF first, then extracts text
   - **Images** (JPG/PNG): Uses OCR (pytesseract + Tesseract engine)
   - **Excel** (XLS/XLSX): Uses `openpyxl` or `xlrd`
   
   **d) Resume Parsing** (`services/parse_service.py`):
   ```python
   parsed_profile = parse_resume_text_sync(text)
   ```
   - Uses OpenAI GPT-4o-mini model
   - Extracts structured data:
     - name, email, phone, location
     - skills, experience_years
     - education, certifications
     - companies, current_company, clients
   - Robust JSON parsing with multiple fallback strategies
   - Handles truncated/malformed JSON responses
   
   **e) Fallback Extraction:**
   ```python
   If name is missing:
       - Extract from first few lines of text
       - Skip email addresses, URLs, phone numbers
   
   If email is missing:
       - Extract using regex: [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}
   ```
   
   **f) Skill Domain Inference:**
   ```python
   skill_domains = infer_skill_domains(skills, text)
   ```
   - Maps skills to domains (e.g., "Python" → "Software Development")
   
   **g) Profile Document Creation:**
   ```python
   profile_doc = build_profile_document(
       parsed_profile, text, filename, stored_filename,
       stored_bytes, uploaded_by_admin, missing_fields,
       issues, skill_domains
   )
   ```
   - Creates MongoDB document with:
     - Profile ID (UUID)
     - Parsed fields
     - Raw text
     - Resume file (Binary)
     - Metadata (uploaded_at, updated_at, status)
     - Missing fields tracking
   
   **h) Database Storage** (`store_profile_document()`):
   ```python
   Check if profile exists by:
      1. Email (exact match)
      2. Phone number (normalized match)
      3. Profile ID or source filename
   
   If exists:
      - Update existing profile (smart merge)
      - Preserve valid existing data
      - Update immutable fields
   
   If not exists:
      - Insert new profile
   ```
   
   **i) Vector Embedding** (`embed_profile_text()`):
   ```python
   upsert_vector(profile_id, text, metadata)
   ```
   - Generates embedding using OpenAI `text-embedding-3-small`
   - Stores in FAISS index for semantic search
   - Updates vector store mapping

3. **Task Progress Updates:**
   ```python
   self.update_state(
       state="PROGRESS",
       meta={"current": index, "total": total, "status": "..."}
   )
   ```

4. **Final Summary:**
   ```python
   Returns:
   {
       "imported": count,
       "failed": count,
       "failed_files": [...],
       "partial_imports": count,
       "timestamp": "...",
       "failed_details": [...]
   }
   ```

---

### C. Trainer Self-Upload Flow (`/trainer/upload_resume`)

**Simplified flow** (single file, synchronous):

```
Frontend: TrainerDashboard.jsx
    ↓
POST /trainer/upload_resume (FormData: file, name, email)
    ↓
1. Extract text from file
2. Parse resume (OpenAI)
3. Validate name/email
4. Store/update profile in MongoDB
5. Generate and store vector embedding
6. Clear embedding cache
7. Return success response
```

**Key Differences from Bulk Upload:**
- Synchronous processing (no Celery)
- Single file at a time
- Trainer must be authenticated
- Email must match logged-in trainer

---

## 2. TEXT EXTRACTION FLOW

### Supported File Formats

#### A. PDF Files (`extract_text_from_bytes()`)
```python
1. Try standard text extraction (pdfplumber)
   - If successful and text length > 50 chars → return text
   
2. If insufficient text (likely scanned PDF):
   - Convert PDF pages to images (pdf2image, 300 DPI)
   - Run OCR on each page (pytesseract)
   - Combine OCR text
   - Return OCR result
```

#### B. DOC/DOCX Files
```python
1. Save file to temp location
2. Convert to PDF using LibreOffice:
   soffice --headless --convert-to pdf --outdir <temp> <file>
3. Extract text from converted PDF
4. If still no text, try OCR on PDF
5. Clean up temp files
```

#### C. Image Files (JPG/PNG/JPEG)
```python
1. Load image using PIL (Pillow)
2. Convert to RGB mode if needed
3. Run OCR using pytesseract (Tesseract engine)
4. Clean and return text
```

#### D. Excel Files (XLS/XLSX)
```python
.xlsx: Use openpyxl
   - Read all sheets
   - Extract cell values
   - Join with " | " separator
   
.xls: Use xlrd
   - Handle date cells specially
   - Extract cell values
   - Format as text
```

---

## 3. RESUME PARSING FLOW

### A. OpenAI Parsing (`services/parse_service.py`)

```python
async def parse_resume_text(text: str) -> dict:
```

**Process:**

1. **Prompt Construction:**
   - Creates detailed prompt with JSON schema
   - Includes resume text
   - Specifies all required fields

2. **API Call:**
   ```python
   client.chat.completions.create(
       model="gpt-4o-mini",
       messages=[{"role": "user", "content": prompt}],
       max_tokens=2000,
       response_format={"type": "json_object"}
   )
   ```

3. **Response Parsing:**
   - Removes markdown code blocks (```json)
   - Extracts JSON object (finds first { to last })
   - Uses `robust_json_parse()` with multiple fallback strategies:
     - Direct JSON parse
     - Fix trailing commas
     - Handle unterminated strings
     - Extract partial data using regex
   
4. **Data Cleaning:**
   - Removes address patterns from name
   - Limits name to first 3 words max
   - Normalizes email (lowercase)
   - Converts experience_years to float

5. **Returns Structured Data:**
   ```python
   {
       "name": str,
       "email": str,
       "phone": str,
       "location": str,
       "skills": [str, ...],
       "experience_years": float,
       "education": str or [dict, ...],
       "certifications": [str, ...],
       "companies": [str, ...],
       "current_company": str,
       "clients": [str, ...]
   }
   ```

---

## 4. STORAGE FLOW

### A. MongoDB Storage

**Collection:** `trainer_profiles`

**Document Structure:**
```python
{
    "_id": str (UUID),           # MongoDB ObjectId
    "profile_id": str (UUID),    # Application-level ID
    "name": str,
    "email": str,
    "phone": str,
    "location": str,
    "skills": [str, ...],
    "skill_domains": [str, ...],
    "experience_years": float,
    "education": [str, ...],
    "certifications": [str, ...],
    "companies": [str, ...],
    "current_company": str,
    "clients": [str, ...],
    "raw_text": str,             # Full extracted text
    "resume_file": Binary,       # PDF or original file bytes
    "resume_filename": str,      # Stored filename (may be .pdf)
    "source_filename": str,      # Original filename
    "uploaded_by": str (email),
    "uploaded_at": datetime,
    "updated_at": datetime,
    "file_size_bytes": int,
    "missing_fields": [str, ...], # Fields that couldn't be extracted
    "issues": [str, ...],        # Processing issues
    "status": str                 # "complete" or "partial"
}
```

**Storage Logic:**
```python
1. Check for existing profile:
   - By email (exact match)
   - By phone (normalized: remove spaces, dashes, parentheses)
   - By profile_id or source_filename (fallback)

2. If exists:
   - Update existing document
   - Smart merge: preserve valid existing data
   - Update updated_at timestamp
   - Merge email/phone if missing in existing

3. If not exists:
   - Insert new document
   - Set uploaded_at = now()
```

---

### B. Vector Store Storage (`services/vector_store.py`)

**Purpose:** Enable semantic search using embeddings

**Process:**

1. **Embedding Generation:**
   ```python
   embedding = client.embeddings.create(
       model="text-embedding-3-small",
       input=text
   ).data[0].embedding
   ```
   - Dimension: 1536
   - Normalized vectors (for cosine similarity)

2. **FAISS Index Storage:**
   ```python
   # Add vector to FAISS index
   faiss_index.add(normalized_vector)
   
   # Store metadata mapping
   vector_store[index_id] = {
       "profile_id": str,
       "email": str,
       "name": str,
       "skills": [str, ...],
       "skill_domains": [str, ...],
       ...
   }
   ```

3. **Index Types:**
   - **Small datasets (<1000 vectors)**: `IndexFlatIP` (exact search)
   - **Large datasets (>=1000 vectors)**: `IndexHNSWFlat` (approximate, faster)

4. **Persistence:**
   ```python
   - Saves FAISS index to: backend/data/faiss_index.bin
   - Saves metadata to: backend/data/vector_store.pkl
   - Auto-saves after updates
   ```

---

## 5. DISPLAY FLOW

### A. Trainer Search Flow (`frontend/src/pages/UnifiedTrainerSearch.jsx`)

#### Search Types:

**1. Job Description (JD) Search:**
```
a) User uploads JD file OR fills form (domain, skills, experience)
   ↓
b) If file: Extract text, parse JD using OpenAI
   ↓
c) Extract: skills, experience_years, domain
   ↓
d) POST /admin/search_by_jd
   {
       "jd_text": str,
       "location": str,
       "top_k": int
   }
   ↓
e) Backend processing:
   - Extract skills from JD
   - Expand skills using domain mapping
   - Generate query embedding
   - Search FAISS index (semantic similarity)
   - Rerank results (optional)
   - Return top K matches
   ↓
f) Frontend displays results with match scores
```

**2. Text Search:**
```
a) User enters query (e.g., "ETL trainer from Bangalore")
   ↓
b) POST /admin/search_by_text
   {
       "query": str,
       "location": str
   }
   ↓
c) Backend:
   - Extract location from query (if present)
   - Generate query embedding
   - Search FAISS index
   - Filter by location (if specified)
   - Stream results (NDJSON):
     * First: 100% matches (perfect)
     * Then: Progressive matches
     * Finally: Complete with all results
   ↓
d) Frontend receives streaming results:
   - Shows 100% matches immediately
   - Adds progressive matches as they arrive
   - Updates UI in real-time
```

#### Search Implementation (`backend/services/vector_store.py`):

```python
def search(query: str, top_k: int, filters: dict = None) -> List[dict]:
    # 1. Generate query embedding
    query_embedding = generate_embedding(query)
    
    # 2. Normalize vector
    query_vec = normalize_vector(query_embedding)
    
    # 3. Search FAISS index
    distances, indices = faiss_index.search(
        np.array([query_vec], dtype=np.float32),
        top_k * 2  # Get more for filtering
    )
    
    # 4. Retrieve metadata for results
    results = []
    for idx, distance in zip(indices[0], distances[0]):
        if idx == -1:  # Invalid index
            continue
        metadata = vector_store.get(idx)
        if metadata:
            # Convert distance to similarity score (0-1)
            score = max(0, min(1, (distance + 1) / 2))
            results.append({
                **metadata,
                "score": score,
                "match_percentage": int(score * 100)
            })
    
    # 5. Apply filters (location, skills, etc.)
    if filters:
        results = apply_filters(results, filters)
    
    # 6. Rerank (optional, using cross-encoder or heuristics)
    results = rerank_results(query, results)
    
    # 7. Return top K
    return results[:top_k]
```

---

### B. Trainer List Display

**Endpoint:** `GET /admin/trainers_list`

**Flow:**
```
1. Query MongoDB trainer_profiles collection
2. Apply filters (optional):
   - Skills
   - Location
   - Experience range
   - Domain
3. Sort by:
   - uploaded_at (newest first)
   - or match score (if from search)
4. Paginate results
5. Return JSON array
```

**Frontend Display** (`UnifiedTrainerSearch.jsx`):
- Shows trainer cards with:
  - Name, email, phone, location
  - Skills (expandable)
  - Experience, education, certifications
  - Companies, current company
  - Match score (if from search)
  - Download PDF button
- Selection checkboxes for bulk export
- Export to Excel functionality

---

### C. PDF Download Flow

**Endpoint:** `GET /admin/trainer/{trainer_email}/download_pdf`

**Flow:**
```
1. Query MongoDB: trainer_profiles.find_one({"email": trainer_email})
2. Extract resume_file (Binary field)
3. Return as PDF response:
   Content-Type: application/pdf
   Content-Disposition: attachment; filename="{name}.pdf"
4. Frontend:
   - Creates blob from response
   - Creates temporary download link
   - Triggers download
   - Cleans up
```

---

## 6. DATA FLOW SUMMARY

```
┌─────────────────────────────────────────────────────────────┐
│                    RESUME UPLOAD FLOW                        │
└─────────────────────────────────────────────────────────────┘

[User] 
  ↓ (Select files)
[Frontend: BulkUpload.jsx]
  ↓ (POST /admin/bulk_upload_start)
[Backend: API]
  ↓ (Queue Celery task)
[Celery Worker: bulk_import_task]
  ↓
  ├─→ [Extract Text] (PDF/DOC/Image/Excel)
  │
  ├─→ [Parse Resume] (OpenAI GPT-4o-mini)
  │
  ├─→ [Store in MongoDB] (trainer_profiles collection)
  │
  └─→ [Generate Embedding] (OpenAI text-embedding-3-small)
      ↓
      [Store in FAISS] (Vector index)
      ↓
      [Save to Disk] (faiss_index.bin, vector_store.pkl)

┌─────────────────────────────────────────────────────────────┐
│                    SEARCH FLOW                               │
└─────────────────────────────────────────────────────────────┘

[User Query]
  ↓
[Frontend: UnifiedTrainerSearch.jsx]
  ↓ (POST /admin/search_by_text or /admin/search_by_jd)
[Backend: API]
  ↓
[Generate Query Embedding] (OpenAI)
  ↓
[Search FAISS Index] (Cosine similarity)
  ↓
[Retrieve Metadata] (From vector_store)
  ↓
[Filter & Rerank] (Location, skills, etc.)
  ↓
[Fetch Full Profiles] (From MongoDB, optional)
  ↓
[Return Results] (JSON or NDJSON stream)
  ↓
[Frontend Display] (Trainer cards with details)

┌─────────────────────────────────────────────────────────────┐
│                    DISPLAY FLOW                              │
└─────────────────────────────────────────────────────────────┘

[User Action]
  ↓
[Frontend Request]
  ├─→ GET /admin/trainers_list (List all trainers)
  ├─→ GET /admin/trainer/{email}/download_pdf (Download resume)
  └─→ POST /admin/export_trainers_to_excel (Bulk export)
  ↓
[Backend Query MongoDB]
  ↓
[Return Data]
  ↓
[Frontend Render] (React components)
```

---

## 7. KEY FEATURES & CAPABILITIES

### A. File Format Support
- ✅ PDF (text + scanned with OCR)
- ✅ DOC/DOCX (converts to PDF first)
- ✅ Images (JPG/PNG - OCR)
- ✅ Excel (XLS/XLSX)

### B. Intelligent Parsing
- ✅ OpenAI GPT-4o-mini for structured extraction
- ✅ Fallback extraction (regex for email, text patterns for name)
- ✅ Robust JSON parsing (handles truncated/malformed responses)
- ✅ Missing field tracking

### C. Vector Search
- ✅ Semantic similarity search
- ✅ FAISS for fast vector operations
- ✅ HNSW index for large datasets
- ✅ Location filtering
- ✅ Skill-based matching

### D. Scalability
- ✅ Async processing (Celery)
- ✅ Parallel file processing
- ✅ Streaming search results
- ✅ Efficient vector indexing

### E. User Experience
- ✅ Real-time progress updates
- ✅ Bulk operations
- ✅ Export to Excel
- ✅ PDF download
- ✅ Responsive UI

---

## 8. ENVIRONMENT & CONFIGURATION

### Required Services
1. **MongoDB**: `mongodb://mongo:27017` (Docker) or `mongodb://localhost:27017`
2. **Celery Worker**: Runs async tasks
3. **Redis/RabbitMQ**: Celery message broker
4. **LibreOffice**: For DOC to PDF conversion (optional, can fail gracefully)
5. **Tesseract OCR**: For image/text extraction (optional)

### Environment Variables
```bash
OPENAI_API_KEY=sk-...
MONGO_URI=mongodb://mongo:27017
MONGO_DB_NAME=resume_app
CELERY_BROKER_URL=redis://redis:6379/0
```

---

## 9. ERROR HANDLING & RESILIENCE

- **File Extraction Failures**: Logs issue, continues with other files
- **Parsing Failures**: Uses fallback extraction, marks as "partial"
- **Database Failures**: Retries up to 3 times with exponential backoff
- **Embedding Failures**: Logs warning, continues without vector (search won't work for that profile)
- **Task Cancellation**: Supports graceful cancellation via Celery revoke

---

## 10. PERFORMANCE OPTIMIZATIONS

1. **Parallel Processing**: 4 concurrent workers for file processing
2. **Async Operations**: Non-blocking API endpoints
3. **Vector Caching**: Embeddings cached in memory
4. **Efficient Indexing**: HNSW for large datasets (100x faster than brute force)
5. **Streaming Results**: Progressive result display for better UX
6. **Database Indexing**: MongoDB indexes on email, phone for fast lookups

---

This documentation covers the complete flow of resume upload, extraction, storage, and display in the Gisul AI Resume Portal system.


