import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {authMiddleware} from './auth/middleware.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({status: 'ok'});
});

app.get('/api/users', authMiddleware, (_req, res) => {
  res.json({users: []});
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
