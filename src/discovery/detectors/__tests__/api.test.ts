import {describe, it, expect} from 'vitest';
import {apiDetector} from '../api.js';
import {createMockContext} from './helpers.js';

describe('apiDetector', () => {
  it('detects Express routes (app.get, router.post)', async () => {
    const ctx = createMockContext({
      'src/routes.ts': `
import {Router} from 'express';
const router = Router();

router.get('/api/users', getUsers);
router.post('/api/users', createUser);
router.put('/api/users/:id', updateUser);
router.delete('/api/users/:id', deleteUser);
`,
    });

    const result = await apiDetector.detect(ctx);

    expect(result.routeCount).toBeGreaterThan(0);
    expect(result.endpoints.length).toBe(4);
    expect(result.styles).toContain('rest');

    const getEndpoint = result.endpoints.find(
      e => e.method === 'GET' && e.path === '/api/users',
    );
    expect(getEndpoint).toBeDefined();
    expect(getEndpoint!.file).toBe('src/routes.ts');

    const postEndpoint = result.endpoints.find(
      e => e.method === 'POST' && e.path === '/api/users',
    );
    expect(postEndpoint).toBeDefined();
  });

  it('detects OpenAPI spec file', async () => {
    const ctx = createMockContext({
      'api/openapi.yaml': `
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
`,
    });

    const result = await apiDetector.detect(ctx);

    expect(result.specFile).toBe('api/openapi.yaml');
    expect(result.styles).toContain('rest');
  });

  it('detects GraphQL API style', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          '@apollo/server': '^4.0.0',
          'graphql': '^16.0.0',
        },
      }),
      'src/schema.graphql': `
type Query {
  users: [User!]!
}

type User {
  id: ID!
  name: String!
}
`,
    });

    const result = await apiDetector.detect(ctx);

    expect(result.styles).toContain('graphql');
  });

  it('returns routeCount = 0 when no API detected', async () => {
    const ctx = createMockContext({
      'src/index.ts': `
console.log('Hello world');
`,
    });

    const result = await apiDetector.detect(ctx);

    expect(result.routeCount).toBe(0);
    expect(result.endpoints).toEqual([]);
    // When nothing is detected, default style is 'unknown'
    expect(result.styles).toContain('unknown');
  });

  it('detects tRPC style from dependencies', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          '@trpc/server': '^10.0.0',
          '@trpc/client': '^10.0.0',
        },
      }),
    });

    const result = await apiDetector.detect(ctx);

    expect(result.styles).toContain('trpc');
  });

  it('detects multiple API styles in the same project', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
          'graphql': '^16.0.0',
          '@apollo/server': '^4.0.0',
        },
      }),
      'src/routes.ts': `
const app = express();
app.get('/api/health', healthCheck);
`,
      'src/schema.graphql': 'type Query { health: String }',
    });

    const result = await apiDetector.detect(ctx);

    expect(result.styles).toContain('rest');
    expect(result.styles).toContain('graphql');
  });

  it('detects NestJS decorator routes', async () => {
    const ctx = createMockContext({
      'src/users.controller.ts': `
import {Controller, Get, Post} from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get('/list')
  findAll() {}

  @Post('/create')
  create() {}
}
`,
    });

    const result = await apiDetector.detect(ctx);

    expect(result.routeCount).toBe(2);
    expect(result.styles).toContain('rest');
  });
});
