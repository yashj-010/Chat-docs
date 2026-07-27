#  ChatDocs AI — RAG-based Document Intelligence System

> Ask questions over PDFs and get accurate, context-aware answers using LLMs.

---

##  Overview

ChatDocs AI is a production-ready Retrieval-Augmented Generation (RAG) system that enables users to upload documents (PDFs) and interact with them using natural language queries.

Unlike traditional keyword search, this system uses semantic retrieval + LLM reasoning to provide precise, context-aware responses.

---

##  Key Features

-  Upload and process large PDFs  
-  Semantic search using vector embeddings  
-  Context-aware Q&A using LLMs  
-  Asynchronous document ingestion (Redis + BullMQ)  
-  Secure authentication (Clerk)  
-  Deployed across AWS, Render, and Vercel  
-  Scalable and modular architecture  

---

##  System Architecture

```
User Uploads PDF
        ↓
Chunking & Processing
        ↓
Embeddings Generation
        ↓
Vector DB (Qdrant)
        ↓
User Query
        ↓
Similarity Search
        ↓
Relevant Chunks
        ↓
LLM Response (OpenAI)
```

---

## Tech Stack

- **Frontend:** Next.js, Tailwind CSS  
- **Backend:** Node.js, Express  
- **Queue System:** Redis, BullMQ  
- **Vector DB:** Qdrant  
- **LLM:** OpenAI APIs  
- **Orchestration:** LangChain  
- **Deployment:** AWS, Render, Vercel  

---

##  How It Works

### 1. Document Ingestion
- PDF is uploaded  
- Parsed and split into chunks  

---

### 2. Chunking Strategy (IMPORTANT)

- Chunk size: ~400 tokens  
- Overlap: ~50 tokens  

 This balances:
- Context retention  
- Retrieval precision  
- Cost efficiency  

---

### 3. Embeddings + Storage

- Each chunk → embedding  
- Stored in Qdrant vector DB  

---

### 4. Query Flow

- User asks a question  
- Relevant chunks retrieved via similarity search  
- Context passed to LLM  
- LLM generates grounded response  

---

##  Prompt Design

```text
Answer strictly using the context below.
If the answer is not present, say "Not found".

Context:
{retrieved_chunks}

Question:
{user_query}
```

 Prevents hallucination + improves reliability  

---

## Challenges & Trade-offs

###  Chunk Size vs Accuracy
- Smaller chunks → better precision  
- Larger chunks → better context  

 Solution: balanced chunk size + overlap  

---

###  Latency vs Quality
- More chunks = better answers  
- But slower response  

 Optimized retrieval count  

---

###  Retrieval Quality
- Initial issue: irrelevant context  

**Fix:**
- Better chunking  
- Improved preprocessing  
- Prompt tuning  

---

##  Key Bug & Fix

**Issue:** Inconsistent answers for same query  

**Cause:** Poor chunking → missing context  

**Fix:**
- Added overlap  
- Improved embedding consistency  
- Enforced strict prompt grounding  

---

##  Sample Output

```
Q: What are the key insights from the document?

A:
- The report highlights strong revenue growth
- Focus on AI-driven products
- Potential risks in market volatility
```

---

##  Getting Started

### 1. Clone repo
```bash
git clone https://github.com/yashj-010/Chat-docs.git
cd Chat-docs
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables
```env
OPENAI_API_KEY=your_key
QDRANT_URL=your_url
REDIS_URL=your_url
```

### 4. Run project
```bash
npm run dev
```

---

##  Future Improvements

-  Add reranking for better retrieval  
-  Add evaluation metrics (precision/recall)  
-  Fine-tune domain-specific models  
-  Streaming responses for better UX  

---

##  Key Learnings

- Retrieval quality > model size  
- Prompt design is critical  
- AI systems require strong backend engineering  
- Async pipelines are essential for scalability  

---

## Author

**Yash Jain**  
IIIT Bhopal (CSE)  

---

## Why This Project Stands Out

- Production-ready architecture  
- Real-world scalability considerations  
- Strong integration of AI + backend systems  
- Focus on reliability, not just demo  
