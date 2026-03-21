import type {Detector, DetectorContext, DatabaseInfo, DatabaseEntry} from '../types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface DbSignature {
  type: string;
  role: 'driver' | 'orm';
}

const NODE_DB_MAP: Record<string, DbSignature> = {
  // PostgreSQL
  'pg':                 {type: 'postgresql', role: 'driver'},
  'postgres':           {type: 'postgresql', role: 'driver'},
  '@neondatabase/serverless': {type: 'postgresql', role: 'driver'},

  // MySQL
  'mysql2':             {type: 'mysql', role: 'driver'},
  'mysql':              {type: 'mysql', role: 'driver'},

  // SQLite
  'better-sqlite3':     {type: 'sqlite', role: 'driver'},
  'sql.js':             {type: 'sqlite', role: 'driver'},

  // MongoDB
  'mongodb':            {type: 'mongodb', role: 'driver'},
  'mongoose':           {type: 'mongodb', role: 'orm'},

  // Redis
  'redis':              {type: 'redis', role: 'driver'},
  'ioredis':            {type: 'redis', role: 'driver'},

  // ORMs (detect DB type from driver co-presence)
  'drizzle-orm':        {type: 'unknown', role: 'orm'},
  'drizzle-kit':        {type: 'unknown', role: 'orm'},
  '@prisma/client':     {type: 'unknown', role: 'orm'},
  'prisma':             {type: 'unknown', role: 'orm'},
  'sequelize':          {type: 'unknown', role: 'orm'},
  'typeorm':            {type: 'unknown', role: 'orm'},
  'knex':               {type: 'unknown', role: 'orm'},
  '@mikro-orm/core':    {type: 'unknown', role: 'orm'},
  'kysely':             {type: 'unknown', role: 'orm'},
};

const ORM_NAMES: Record<string, string> = {
  'drizzle-orm': 'drizzle',
  'drizzle-kit': 'drizzle',
  '@prisma/client': 'prisma',
  'prisma': 'prisma',
  'sequelize': 'sequelize',
  'typeorm': 'typeorm',
  'knex': 'knex',
  '@mikro-orm/core': 'mikro-orm',
  'kysely': 'kysely',
  'mongoose': 'mongoose',
};

/** Well-known migration directory patterns. */
const MIGRATION_DIRS = [
  'drizzle',
  'prisma/migrations',
  'migrations',
  'db/migrate',
  'db/migrations',
  'src/migrations',
  'src/db/migrations',
  'database/migrations',
];

/** Well-known schema directory patterns. */
const SCHEMA_DIRS = [
  'prisma',
  'src/db/schema',
  'src/schema',
  'db/schema',
  'src/entities',
  'src/models',
];

export const databaseDetector: Detector<DatabaseInfo> = {
  name: 'database',

  async detect(ctx: DetectorContext): Promise<DatabaseInfo> {
    const drivers = new Set<string>();
    const orms = new Set<string>();
    let detectedType: string | undefined;

    // ── Scan package.json files ──
    const pkgFiles = await ctx.findFiles(['**/package.json']);
    for (const pkgFile of pkgFiles) {
      const pkg = await ctx.readJson<PackageJson>(pkgFile);
      if (!pkg) continue;
      const allDeps = {...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {})};

      for (const dep of Object.keys(allDeps)) {
        const sig = NODE_DB_MAP[dep];
        if (!sig) continue;

        if (sig.role === 'driver' && sig.type !== 'unknown') {
          drivers.add(sig.type);
          detectedType = sig.type;
        }
        const ormName = ORM_NAMES[dep];
        if (ormName) {
          orms.add(ormName);
        }
      }
    }

    // ── Python deps ──
    const reqFiles = await ctx.findFiles(['requirements.txt', '**/requirements.txt']);
    for (const reqFile of reqFiles) {
      const content = await ctx.readFile(reqFile);
      if (!content) continue;
      for (const line of content.split('\n')) {
        const pkg = line.trim().split(/[=<>!~]/)[0].toLowerCase();
        if (pkg === 'psycopg2' || pkg === 'asyncpg' || pkg === 'psycopg2-binary') {
          drivers.add('postgresql');
          detectedType = 'postgresql';
        }
        if (pkg === 'pymysql' || pkg === 'mysqlclient') {
          drivers.add('mysql');
          detectedType = detectedType ?? 'mysql';
        }
        if (pkg === 'sqlalchemy') orms.add('sqlalchemy');
        if (pkg === 'django') orms.add('django-orm');
      }
    }

    // ── Find migration directories ──
    let migrationsDir: string | undefined;
    for (const dir of MIGRATION_DIRS) {
      const files = await ctx.findFiles([`${dir}/**/*`]);
      if (files.length > 0) {
        migrationsDir = dir;
        break;
      }
    }

    // ── Find schema directories ──
    let schemaDir: string | undefined;
    for (const dir of SCHEMA_DIRS) {
      const files = await ctx.findFiles([`${dir}/**/*.ts`, `${dir}/**/*.prisma`, `${dir}/**/*.py`]);
      if (files.length > 0) {
        schemaDir = dir;
        break;
      }
    }

    // ── Build results ──
    const databases: DatabaseEntry[] = [];

    if (detectedType || orms.size > 0) {
      databases.push({
        type: detectedType ?? 'unknown',
        driver: [...drivers][0],
        orm: [...orms][0],
        migrationsDir,
        schemaDir,
        confidence: detectedType ? 1.0 : 0.6,
      });
    }

    return {databases};
  },
};
