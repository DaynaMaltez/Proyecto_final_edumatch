import { app } from './app.js';
import { ensureCategories } from './modules/admin/category.routes.js';
import { createServer } from 'node:http';
import { attachChat } from './modules/chat/chat.socket.js';
import { connectToDatabase } from './config/database.js';
import { env, getRequiredEnv } from './config/env.js';

async function startServer(): Promise<void> {
  try {
    const mongoUri = getRequiredEnv('MONGODB_URI');
    await connectToDatabase(mongoUri);
    await ensureCategories();
    console.log('Connected to MongoDB.');

    const server = createServer(app);
    attachChat(server);
    server.listen(env.port, () => {
      console.log(`Marketplace API listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Missing required environment variable')) {
      console.error(error.message);
    } else {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      console.error(
        `MongoDB connection failed (${errorType}). Check the Atlas network access list, database user permissions, and MONGODB_URI in backend/.env. Connection details are hidden to protect credentials.`,
      );
    }
    process.exit(1);
  }
}

void startServer();
