import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {rateLimit} from 'express-rate-limit';
import {apiRouter} from './routes/api.js';
import {authMiddleware} from './auth/middleware.js';

const app = express();
const port = process.env.PORT ?? 3000;

// Security middleware
app.use(helmet());
app.use(cors({origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'}));
app.use(express.json({limit: '10kb'}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()});
});

// Protected API routes
app.use('/api', authMiddleware, apiRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export {app};
