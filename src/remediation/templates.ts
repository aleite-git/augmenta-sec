/**
 * ASEC-075: Fix templates for common security vulnerabilities.
 *
 * Provides pre-built code patterns for frequent remediation tasks:
 * rate limiter, auth middleware, input sanitization, CSRF protection,
 * and output escaping. Templates are parameterized with placeholder
 * variables that callers substitute before applying.
 */

/** A single fix template with metadata and parameterized code. */
export interface FixTemplate {
  /** Machine-readable identifier. */
  id: string;
  /** Short human-readable name. */
  name: string;
  /** Description of what this template fixes. */
  description: string;
  /** CWE identifiers this template addresses. */
  cweIds: string[];
  /** The template code with `{{variable}}` placeholders. */
  template: string;
  /** Names of required placeholder variables. */
  variables: string[];
  /** Language this template targets. */
  language: string;
}

/** Built-in fix templates. */
const BUILTIN_TEMPLATES: FixTemplate[] = [
  {
    id: 'rate-limiter',
    name: 'Rate Limiter Middleware',
    description:
      'Adds express-rate-limit middleware to protect endpoints against brute-force and DoS attacks.',
    cweIds: ['CWE-307', 'CWE-799'],
    language: 'typescript',
    variables: ['windowMs', 'maxRequests', 'routePath'],
    template: [
      "import rateLimit from 'express-rate-limit';",
      '',
      'const limiter = rateLimit({',
      '  windowMs: {{windowMs}},',
      '  max: {{maxRequests}},',
      '  standardHeaders: true,',
      '  legacyHeaders: false,',
      "  message: { error: 'Too many requests, please try again later.' },",
      '});',
      '',
      'app.use({{routePath}}, limiter);',
    ].join('\n'),
  },
  {
    id: 'auth-middleware',
    name: 'Authentication Middleware',
    description:
      'Adds JWT-based authentication middleware that validates tokens before allowing access to protected routes.',
    cweIds: ['CWE-287', 'CWE-306'],
    language: 'typescript',
    variables: ['secretEnvVar', 'routePath'],
    template: [
      "import { Request, Response, NextFunction } from 'express';",
      "import jwt from 'jsonwebtoken';",
      '',
      'function authMiddleware(req: Request, res: Response, next: NextFunction): void {',
      "  const authHeader = req.headers['authorization'];",
      "  if (!authHeader || !authHeader.startsWith('Bearer ')) {",
      "    res.status(401).json({ error: 'Missing or invalid authorization header' });",
      '    return;',
      '  }',
      '',
      "  const token = authHeader.substring('Bearer '.length);",
      '  try {',
      '    const secret = process.env[{{secretEnvVar}}];',
      '    if (!secret) {',
      "      throw new Error('JWT secret not configured');",
      '    }',
      '    const decoded = jwt.verify(token, secret);',
      '    (req as Record<string, unknown>).user = decoded;',
      '    next();',
      '  } catch {',
      "    res.status(401).json({ error: 'Invalid or expired token' });",
      '  }',
      '}',
      '',
      'app.use({{routePath}}, authMiddleware);',
    ].join('\n'),
  },
  {
    id: 'input-sanitization',
    name: 'Input Sanitization',
    description:
      'Sanitizes user input to prevent injection attacks by escaping or stripping dangerous characters.',
    cweIds: ['CWE-79', 'CWE-89'],
    language: 'typescript',
    variables: ['fieldName'],
    template: [
      '/** Strips HTML tags and trims whitespace from a user-supplied string. */',
      'function sanitizeInput(value: string): string {',
      "  return value.replace(/<[^>]*>/g, '').trim();",
      '}',
      '',
      'const safe{{fieldName}} = sanitizeInput(raw{{fieldName}});',
    ].join('\n'),
  },
  {
    id: 'csrf-protection',
    name: 'CSRF Protection Middleware',
    description:
      'Adds CSRF token validation middleware to protect state-changing endpoints.',
    cweIds: ['CWE-352'],
    language: 'typescript',
    variables: ['cookieName', 'routePath'],
    template: [
      "import csrf from 'csurf';",
      '',
      'const csrfProtection = csrf({',
      '  cookie: {',
      '    key: {{cookieName}},',
      '    httpOnly: true,',
      '    sameSite: true,',
      '    secure: process.env.NODE_ENV === "production",',
      '  },',
      '});',
      '',
      'app.use({{routePath}}, csrfProtection);',
    ].join('\n'),
  },
  {
    id: 'output-escaping',
    name: 'Output Escaping',
    description:
      'Escapes special HTML characters in output to prevent XSS when rendering user-supplied content.',
    cweIds: ['CWE-79', 'CWE-116'],
    language: 'typescript',
    variables: ['variableName'],
    template: [
      '/** Escapes HTML special characters to prevent XSS. */',
      'function escapeHtml(unsafe: string): string {',
      '  return unsafe',
      "    .replace(/&/g, '&amp;')",
      "    .replace(/</g, '&lt;')",
      "    .replace(/>/g, '&gt;')",
      '    .replace(/"/g, \'&quot;\')',
      "    .replace(/'/g, '&#039;');",
      '}',
      '',
      'const safe{{variableName}} = escapeHtml(raw{{variableName}});',
    ].join('\n'),
  },
];

/**
 * Retrieves all built-in fix templates.
 */
export function getTemplates(): FixTemplate[] {
  return [...BUILTIN_TEMPLATES];
}

/**
 * Finds a template by its ID.
 *
 * @returns The matching template, or `undefined` if not found.
 */
export function getTemplateById(id: string): FixTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Finds templates that match a given CWE identifier.
 *
 * @param cweId - A CWE identifier, e.g. "CWE-79".
 * @returns All templates whose `cweIds` include the given CWE.
 */
export function getTemplatesByCwe(cweId: string): FixTemplate[] {
  return BUILTIN_TEMPLATES.filter((t) => t.cweIds.includes(cweId));
}

/**
 * Renders a template by substituting `{{variable}}` placeholders.
 *
 * @param template - The fix template to render.
 * @param vars - A map of variable names to their values.
 * @returns The rendered template code.
 * @throws {Error} if required variables are missing.
 */
export function renderTemplate(
  template: FixTemplate,
  vars: Record<string, string>,
): string {
  const missing = template.variables.filter(
    (v) => vars[v] === undefined || vars[v] === null,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing variables for template "${template.id}": ${missing.join(', ')}`,
    );
  }

  let rendered = template.template;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}
