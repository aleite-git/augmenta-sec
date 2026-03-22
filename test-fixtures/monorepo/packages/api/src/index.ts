import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {validateUser} from '@acme/shared';

const app = express();
const port = process.env.PORT ?? 4000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({status: 'ok'});
});

app.post('/api/users', (req, res) => {
  const result = validateUser(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error});
    return;
  }
  res.status(201).json({data: result.data});
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

export {app};
