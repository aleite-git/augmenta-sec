import {describe, it, expect} from 'vitest';
import {databaseDetector} from '../database.js';
import {createMockContext} from './helpers.js';

describe('databaseDetector', () => {
  it('detects PostgreSQL with Prisma ORM', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          '@prisma/client': '^5.0.0',
          'pg': '^8.11.0',
        },
        devDependencies: {
          'prisma': '^5.0.0',
        },
      }),
      'prisma/schema.prisma': 'generator client {}',
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    const db = result.databases[0];
    expect(db.type).toBe('postgresql');
    expect(db.orm).toBe('prisma');
    expect(db.confidence).toBe(1.0);
  });

  it('detects MongoDB with Mongoose driver/ORM', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'mongodb': '^6.0.0',
          'mongoose': '^7.0.0',
        },
      }),
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    const db = result.databases[0];
    expect(db.type).toBe('mongodb');
    expect(db.orm).toBe('mongoose');
  });

  it('detects SQLite database', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'better-sqlite3': '^9.0.0',
        },
      }),
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    const db = result.databases[0];
    expect(db.type).toBe('sqlite');
  });

  it('returns empty databases array when no database detected', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
          'lodash': '^4.17.0',
        },
      }),
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases).toEqual([]);
  });

  it('detects migration directories', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'drizzle-orm': '^0.30.0',
          'pg': '^8.11.0',
        },
      }),
      'drizzle/0000_initial.sql': 'CREATE TABLE users ...',
      'drizzle/0001_update.sql': 'ALTER TABLE users ...',
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    expect(result.databases[0].migrationsDir).toBe('drizzle');
  });

  it('detects schema directories', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'drizzle-orm': '^0.30.0',
          'pg': '^8.11.0',
        },
      }),
      'src/db/schema/users.ts': 'export const users = pgTable(...)',
      'src/db/schema/posts.ts': 'export const posts = pgTable(...)',
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    expect(result.databases[0].schemaDir).toBe('src/db/schema');
  });

  it('detects Redis as a database', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'ioredis': '^5.3.0',
        },
      }),
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    expect(result.databases[0].type).toBe('redis');
  });

  it('detects database from Python requirements', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'sqlalchemy==2.0.0\npsycopg2-binary==2.9.0\n',
    });

    const result = await databaseDetector.detect(ctx);

    expect(result.databases.length).toBeGreaterThan(0);
    const db = result.databases[0];
    expect(db.type).toBe('postgresql');
    expect(db.orm).toBe('sqlalchemy');
  });
});
