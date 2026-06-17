import mongoose from 'mongoose';
import { env } from './env.js';
import logger from '../middleware/logsCreate.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  logger.info({ tag: 'db', message: 'MongoDB connected' });
}
