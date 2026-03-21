import express from 'express';
import type {ApiResponse} from '@monorepo/shared';

const app = express();

app.get('/api/health', (_req, res) => {
  const response: ApiResponse<string> = {data: 'ok', error: null};
  res.json(response);
});

app.listen(3000);
