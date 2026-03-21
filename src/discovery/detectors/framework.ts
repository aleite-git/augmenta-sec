import type {Detector, DetectorContext, FrameworkInfo, FrameworkEntry} from '../types.js';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface FrameworkSignature {
  name: string;
  category: FrameworkEntry['category'];
  ecosystem: string;
}

/** Maps npm package names to framework identities. */
const NODE_FRAMEWORK_MAP: Record<string, FrameworkSignature> = {
  // Backend
  'express':              {name: 'express', category: 'backend', ecosystem: 'node'},
  'fastify':              {name: 'fastify', category: 'backend', ecosystem: 'node'},
  '@nestjs/core':         {name: 'nestjs', category: 'backend', ecosystem: 'node'},
  'koa':                  {name: 'koa', category: 'backend', ecosystem: 'node'},
  '@hapi/hapi':           {name: 'hapi', category: 'backend', ecosystem: 'node'},
  'hono':                 {name: 'hono', category: 'backend', ecosystem: 'node'},
  'elysia':               {name: 'elysia', category: 'backend', ecosystem: 'node'},

  // Frontend
  'react':                {name: 'react', category: 'frontend', ecosystem: 'node'},
  'react-dom':            {name: 'react', category: 'frontend', ecosystem: 'node'},
  'vue':                  {name: 'vue', category: 'frontend', ecosystem: 'node'},
  '@angular/core':        {name: 'angular', category: 'frontend', ecosystem: 'node'},
  'svelte':               {name: 'svelte', category: 'frontend', ecosystem: 'node'},
  'solid-js':             {name: 'solid', category: 'frontend', ecosystem: 'node'},
  'preact':               {name: 'preact', category: 'frontend', ecosystem: 'node'},

  // Fullstack / meta-frameworks
  'next':                 {name: 'nextjs', category: 'fullstack', ecosystem: 'node'},
  'nuxt':                 {name: 'nuxt', category: 'fullstack', ecosystem: 'node'},
  '@remix-run/node':      {name: 'remix', category: 'fullstack', ecosystem: 'node'},
  '@remix-run/react':     {name: 'remix', category: 'fullstack', ecosystem: 'node'},
  'astro':                {name: 'astro', category: 'fullstack', ecosystem: 'node'},
  '@sveltejs/kit':        {name: 'sveltekit', category: 'fullstack', ecosystem: 'node'},

  // ORM / data access
  'drizzle-orm':          {name: 'drizzle', category: 'orm', ecosystem: 'node'},
  '@prisma/client':       {name: 'prisma', category: 'orm', ecosystem: 'node'},
  'sequelize':            {name: 'sequelize', category: 'orm', ecosystem: 'node'},
  'typeorm':              {name: 'typeorm', category: 'orm', ecosystem: 'node'},
  'mongoose':             {name: 'mongoose', category: 'orm', ecosystem: 'node'},
  'knex':                 {name: 'knex', category: 'orm', ecosystem: 'node'},
  '@mikro-orm/core':      {name: 'mikro-orm', category: 'orm', ecosystem: 'node'},
  'kysely':               {name: 'kysely', category: 'orm', ecosystem: 'node'},

  // Testing
  'jest':                 {name: 'jest', category: 'testing', ecosystem: 'node'},
  'vitest':               {name: 'vitest', category: 'testing', ecosystem: 'node'},
  'mocha':                {name: 'mocha', category: 'testing', ecosystem: 'node'},
  '@playwright/test':     {name: 'playwright', category: 'testing', ecosystem: 'node'},
  'cypress':              {name: 'cypress', category: 'testing', ecosystem: 'node'},
};

/** Python framework detection from requirements files. */
const PYTHON_FRAMEWORK_MAP: Record<string, FrameworkSignature> = {
  'django':     {name: 'django', category: 'backend', ecosystem: 'python'},
  'flask':      {name: 'flask', category: 'backend', ecosystem: 'python'},
  'fastapi':    {name: 'fastapi', category: 'backend', ecosystem: 'python'},
  'starlette':  {name: 'starlette', category: 'backend', ecosystem: 'python'},
  'tornado':    {name: 'tornado', category: 'backend', ecosystem: 'python'},
  'sqlalchemy': {name: 'sqlalchemy', category: 'orm', ecosystem: 'python'},
  'tortoise-orm': {name: 'tortoise', category: 'orm', ecosystem: 'python'},
  'pytest':     {name: 'pytest', category: 'testing', ecosystem: 'python'},
};

/** Go framework detection from go.mod. */
const GO_FRAMEWORK_MAP: Record<string, FrameworkSignature> = {
  'github.com/gin-gonic/gin':   {name: 'gin', category: 'backend', ecosystem: 'go'},
  'github.com/labstack/echo':   {name: 'echo', category: 'backend', ecosystem: 'go'},
  'github.com/gofiber/fiber':   {name: 'fiber', category: 'backend', ecosystem: 'go'},
  'github.com/gorilla/mux':     {name: 'gorilla-mux', category: 'backend', ecosystem: 'go'},
  'gorm.io/gorm':               {name: 'gorm', category: 'orm', ecosystem: 'go'},
  'entgo.io/ent':               {name: 'ent', category: 'orm', ecosystem: 'go'},
};

function cleanVersion(v: string): string {
  return v.replace(/[\^~>=<]/g, '').trim();
}

export const frameworkDetector: Detector<FrameworkInfo> = {
  name: 'framework',

  async detect(ctx: DetectorContext): Promise<FrameworkInfo> {
    const found = new Map<string, FrameworkEntry>();

    // ── Node.js ecosystem ──
    const pkgFiles = await ctx.findFiles(['**/package.json']);
    for (const pkgFile of pkgFiles) {
      const pkg = await ctx.readJson<PackageJson>(pkgFile);
      if (!pkg) continue;
      const allDeps = {...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {})};

      for (const [dep, version] of Object.entries(allDeps)) {
        const sig = NODE_FRAMEWORK_MAP[dep];
        if (sig && !found.has(sig.name)) {
          found.set(sig.name, {
            name: sig.name,
            category: sig.category,
            version: cleanVersion(version),
            confidence: 1.0,
          });
        }
      }
    }

    // ── Python ecosystem ──
    const reqFiles = await ctx.findFiles([
      'requirements.txt',
      '**/requirements.txt',
      'requirements/*.txt',
    ]);
    for (const reqFile of reqFiles) {
      const content = await ctx.readFile(reqFile);
      if (!content) continue;
      for (const line of content.split('\n')) {
        const pkg = line.trim().split(/[=<>!~]/)[0].toLowerCase();
        const sig = PYTHON_FRAMEWORK_MAP[pkg];
        if (sig && !found.has(sig.name)) {
          found.set(sig.name, {
            name: sig.name,
            category: sig.category,
            confidence: 1.0,
          });
        }
      }
    }

    // ── Go ecosystem ──
    const goMod = await ctx.readFile('go.mod');
    if (goMod) {
      for (const [path, sig] of Object.entries(GO_FRAMEWORK_MAP)) {
        if (goMod.includes(path) && !found.has(sig.name)) {
          found.set(sig.name, {
            name: sig.name,
            category: sig.category,
            confidence: 1.0,
          });
        }
      }
    }

    // ── Categorize results ──
    const result: FrameworkInfo = {
      backend: [],
      frontend: [],
      fullstack: [],
      orm: [],
      testing: [],
    };

    for (const entry of found.values()) {
      result[entry.category].push(entry);
    }

    return result;
  },
};
