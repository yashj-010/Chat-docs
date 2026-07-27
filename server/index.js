import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Redis connection configuration (matching Redis Labs format)
// For Redis Labs, if TLS is enabled, use TLS config, otherwise use plain connection
const redisConnection = process.env.REDIS_TLS === 'true' ? {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD || '',
  tls: {
    rejectUnauthorized: false,
    servername: process.env.REDIS_HOST || 'localhost' // Important for Redis Labs TLS
  },
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
} : {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD || '',
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

const queue = new Queue('file-upload-queue', {
  connection: redisConnection,
});

// Use memory storage to get file buffer for Cloudinary upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const app = express();

// CORS configuration for production
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (req, res) => {
  return res.json({ status: 'All Good!' });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary using promise-based approach
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'pdf-uploads',
          public_id: `${Date.now()}-${req.file.originalname.replace(/\.[^/.]+$/, '')}`,
          format: 'pdf',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      // Pipe the file buffer to Cloudinary
      const bufferStream = new Readable();
      bufferStream.push(req.file.buffer);
      bufferStream.push(null);
      bufferStream.pipe(stream);
    });

    const result = await uploadPromise;

    // Add job to queue with Cloudinary URL
    await queue.add('file-ready', {
      filename: req.file.originalname,
      cloudinaryUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
    });

    return res.json({ 
      message: 'uploaded',
      cloudinaryUrl: result.secure_url,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/chat', async (req, res) => {
  try {
    const userQuery = req.query.message;
    if (!userQuery) {
      return res.status(400).json({ error: 'Message query parameter is required' });
    }

    console.log(`Processing query: ${userQuery}`);

    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    let vectorStore;
    try {
      vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url: process.env.QDRANT_URL || 'http://localhost:6333',
          apiKey: process.env.QDRANT_API_KEY,
          collectionName: process.env.QDRANT_COLLECTION_NAME || 'Default',
        }
      );
    } catch (error) {
      console.error('Error connecting to Qdrant:', error);
      return res.json({
        message: 'No PDF documents have been uploaded yet. Please upload a PDF file first.',
        docs: [],
      });
    }

    const ret = vectorStore.asRetriever({
      k: 5, // Increased from 2 to get more relevant context
    });
    
    const result = await ret.invoke(userQuery);
    console.log(`Retrieved ${result.length} documents for query: ${userQuery}`);

    // Format the context in a readable way instead of JSON
    const formattedContext = result.length > 0
      ? result
          .map((doc, index) => {
            const pageContent = doc.pageContent || '';
            const metadata = doc.metadata || {};
            return `[Context ${index + 1}]\n${pageContent}\n${metadata.page ? `(Page ${metadata.page})` : ''}`;
          })
          .join('\n\n---\n\n')
      : 'No relevant context found in the PDF.';

//     const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers user queries based on the available context from PDF files.

// Use the following context from the PDF to answer the user's question. If the context doesn't contain enough information to answer the question, say so clearly.

// Context from PDF:
// ${formattedContext}

// Instructions:
// - Answer the question based on the provided context
// - Be clear, concise, and helpful
// - If the context doesn't contain the answer, politely inform the user
// - Format your response in a natural, readable way (not JSON)
// - Do not return JSON format, just plain readable text`;

const SYSTEM_PROMPT = `You are an AI assistant that answers questions **only** using the provided PDF context.

PDF Context:
${formattedContext}

Rules:
- Use **only** the information from the PDF context
- Do **not** use prior knowledge or make assumptions
- If the answer is not clearly present in the context, reply: "The provided PDF does not contain enough information to answer this question."
- Keep the answer clear, concise, and readable
- Respond in plain text (no JSON)`;


    const chatResult = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userQuery },
      ],
    });

    const aiResponse = chatResult.choices[0].message.content;

    // Return response matching client expectations (message and docs)
    return res.json({
      message: aiResponse,
      docs: result.length > 0 ? result.map((doc) => ({
        pageContent: doc.pageContent || '',
        metadata: doc.metadata || {},
      })) : [],
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    return res.status(500).json({
      message: 'Sorry, I encountered an error processing your request. Please try again.',
      docs: [],
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
