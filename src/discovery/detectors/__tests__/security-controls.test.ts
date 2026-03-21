import {describe, it, expect} from 'vitest';
import {securityControlsDetector} from '../security-controls.js';
import {createMockContext} from './helpers.js';

describe('securityControlsDetector', () => {
  it('detects Helmet middleware as present', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'helmet': '^7.0.0',
          'express': '^4.18.0',
        },
      }),
      'src/app.ts': `
import helmet from 'helmet';
import express from 'express';

const app = express();
app.use(helmet());
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    const helmetControl = result.present.find(c => c.type === 'http-headers');
    expect(helmetControl).toBeDefined();
    expect(helmetControl!.name).toBe('HTTP Security Headers');
    expect(helmetControl!.present).toBe(true);
    expect(helmetControl!.confidence).toBe(1.0);
  });

  it('detects CORS configuration as present', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'cors': '^2.8.0',
          'express': '^4.18.0',
        },
      }),
      'src/app.ts': `
import cors from 'cors';
app.use(cors({origin: 'https://example.com'}));
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    const corsControl = result.present.find(c => c.type === 'cross-origin');
    expect(corsControl).toBeDefined();
    expect(corsControl!.name).toBe('CORS');
    expect(corsControl!.present).toBe(true);
  });

  it('detects rate limiting as present', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'express-rate-limit': '^7.0.0',
        },
      }),
      'src/middleware.ts': `
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({windowMs: 60000, max: 100});
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    const rateControl = result.present.find(c => c.type === 'rate-limiting');
    expect(rateControl).toBeDefined();
    expect(rateControl!.name).toBe('Rate Limiting');
    expect(rateControl!.present).toBe(true);
  });

  it('populates missing array when no security controls detected', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
        },
      }),
      'src/index.ts': `
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('hello'));
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    // The always-recommended controls should be in missing
    expect(result.missing.length).toBeGreaterThan(0);
    const missingNames = result.missing.map(c => c.name);
    expect(missingNames).toContain('HTTP Security Headers');
    expect(missingNames).toContain('CORS');
    expect(missingNames).toContain('Rate Limiting');
    expect(missingNames).toContain('Input Validation');

    // All missing controls should have present = false
    for (const control of result.missing) {
      expect(control.present).toBe(false);
    }
  });

  it('detects input validation (zod) as present', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'zod': '^3.22.0',
        },
      }),
      'src/validation.ts': `
import {z} from 'zod';
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    const validation = result.present.find(c => c.type === 'input-validation');
    expect(validation).toBeDefined();
    expect(validation!.present).toBe(true);
  });

  it('detects password hashing as present', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'bcrypt': '^5.1.0',
        },
      }),
      'src/auth.ts': `
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 10);
`,
    });

    const result = await securityControlsDetector.detect(ctx);

    const hashing = result.present.find(c => c.type === 'password-hashing');
    expect(hashing).toBeDefined();
    expect(hashing!.present).toBe(true);
    expect(hashing!.confidence).toBe(1.0);
  });

  it('detects controls from dependency only (no usage grep pattern)', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'csurf': '^1.11.0',
        },
      }),
    });

    const result = await securityControlsDetector.detect(ctx);

    const csrf = result.present.find(c => c.type === 'csrf');
    expect(csrf).toBeDefined();
    expect(csrf!.present).toBe(true);
    // Dependency found but no usage pattern to grep → confidence 0.8
    expect(csrf!.confidence).toBe(0.8);
  });
});
