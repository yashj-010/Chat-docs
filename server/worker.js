import { Worker } from 'bullmq';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Document } from '@langchain/core/documents';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

dotenv.config();

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

const worker = new Worker(
  'file-upload-queue',
  async (job) => {
    console.log(`Job:`, job.data);
    const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;
    
    let tempFilePath = null;
    try {
      // Download PDF from Cloudinary URL
      if (!data.cloudinaryUrl) {
        throw new Error('Cloudinary URL is missing');
      }

      console.log(`Downloading PDF from Cloudinary: ${data.cloudinaryUrl}`);
      const response = await fetch(data.cloudinaryUrl);
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
      }

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Save to temporary file
      tempFilePath = join(tmpdir(), `pdf-${Date.now()}-${data.filename}`);
      await writeFile(tempFilePath, buffer);
      console.log(`PDF saved to temporary file: ${tempFilePath}`);

      // Load the PDF
      const loader = new PDFLoader(tempFilePath);
      const docs = await loader.load();
      console.log(`Loaded ${docs.length} pages from PDF`);

      // Chunk the documents for better retrieval
      const textSplitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Split into ${splitDocs.length} chunks`);

      const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY || '',
      });

      const collectionName = process.env.QDRANT_COLLECTION_NAME || 'Default';
      const qdrantConfig = {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: collectionName,
      };

      // Create vector store - fromDocuments will create collection if it doesn't exist
      let vectorStore;
      try {
        // Try to use existing collection first
        vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          qdrantConfig
        );
        console.log(`Using existing collection: ${collectionName}`);
        // Add documents to existing collection
        await vectorStore.addDocuments(splitDocs);
        console.log(`Successfully added ${splitDocs.length} chunks to existing vector store`);
      } catch (error) {
        // If collection doesn't exist, create it using fromDocuments
        console.log(`Collection ${collectionName} doesn't exist or error accessing it: ${error.message}`);
        console.log(`Creating new collection: ${collectionName}...`);
        // fromDocuments will automatically create the collection
        vectorStore = await QdrantVectorStore.fromDocuments(
          splitDocs,
          embeddings,
          qdrantConfig
        );
        console.log(`Successfully created collection and added ${splitDocs.length} chunks to vector store`);
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
          console.log(`Temporary file deleted: ${tempFilePath}`);
        } catch (error) {
          console.error(`Error deleting temporary file: ${error.message}`);
        }
      }
    }
  },
  {
    concurrency: 100,
    connection: redisConnection,
  }
);
