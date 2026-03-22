import {Router} from 'express';
import {z} from 'zod';

const router = Router();

const userSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'viewer']),
});

// GET /api/users - list users
router.get('/users', async (_req, res) => {
  try {
    // db query placeholder
    res.json({data: [], total: 0});
  } catch (err) {
    console.error('Failed to fetch users:', err);
    res.status(500).json({error: 'Internal server error'});
  }
});

// POST /api/users - create user
router.post('/users', async (req, res) => {
  const result = userSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error.flatten()});
    return;
  }
  try {
    // db insert placeholder
    res.status(201).json({data: result.data});
  } catch (err) {
    console.error('Failed to create user:', err);
    res.status(500).json({error: 'Internal server error'});
  }
});

// GET /api/users/:id - get user by id
router.get('/users/:id', async (req, res) => {
  try {
    const {id} = req.params;
    // db query placeholder
    res.json({data: {id, name: 'placeholder'}});
  } catch (err) {
    console.error('Failed to fetch user:', err);
    res.status(500).json({error: 'Internal server error'});
  }
});

// DELETE /api/users/:id - delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const {id} = req.params;
    // db delete placeholder
    res.status(204).send();
    console.log(`Deleted user ${id}`);
  } catch (err) {
    console.error('Failed to delete user:', err);
    res.status(500).json({error: 'Internal server error'});
  }
});

export {router as apiRouter};
