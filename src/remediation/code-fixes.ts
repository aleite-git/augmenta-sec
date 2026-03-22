/**
 * ASEC-073: Code fix generation for common security findings.
 *
 * Produces before/after code snippets for common vulnerability patterns
 * across multiple languages: TypeScript, JavaScript, Python, Go, Rust,
 * and Java.
 */

import type {Finding} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported languages for code fix generation. */
export type FixLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java';

/** A generated code fix with before/after snippets. */
export interface CodeFix {
  /** The vulnerable code pattern. */
  before: string;
  /** The remediated code pattern. */
  after: string;
  /** Human-readable explanation of the fix. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Fix template type
// ---------------------------------------------------------------------------

interface FixTemplate {
  /** Finding categories to match (case-insensitive substring). */
  categories: string[];
  /** Finding title patterns to match (case-insensitive substring). */
  titlePatterns: string[];
  /** Language-specific before/after/explanation. */
  fixes: Partial<Record<FixLanguage, CodeFix>>;
}

// ---------------------------------------------------------------------------
// Fix templates
// ---------------------------------------------------------------------------

const FIX_TEMPLATES: FixTemplate[] = [
  // Input validation
  {
    categories: ['validation', 'input'],
    titlePatterns: ['input validation', 'unsanitized', 'user input'],
    fixes: {
      typescript: {
        before: [
          'function handleRequest(req: Request) {',
          '  const name = req.body.name;',
          '  db.insert({ name });',
          '}',
        ].join('\n'),
        after: [
          'import { z } from "zod";',
          '',
          'const schema = z.object({',
          '  name: z.string().min(1).max(255).trim(),',
          '});',
          '',
          'function handleRequest(req: Request) {',
          '  const { name } = schema.parse(req.body);',
          '  db.insert({ name });',
          '}',
        ].join('\n'),
        explanation:
          'Validate and sanitize all user input using a schema validation library (e.g., Zod) before processing.',
      },
      javascript: {
        before: [
          'function handleRequest(req) {',
          '  const name = req.body.name;',
          '  db.insert({ name });',
          '}',
        ].join('\n'),
        after: [
          'const Joi = require("joi");',
          '',
          'const schema = Joi.object({',
          '  name: Joi.string().min(1).max(255).trim().required(),',
          '});',
          '',
          'function handleRequest(req) {',
          '  const { value, error } = schema.validate(req.body);',
          '  if (error) throw new Error("Invalid input");',
          '  db.insert({ name: value.name });',
          '}',
        ].join('\n'),
        explanation:
          'Validate all user input with Joi or a similar library before database operations.',
      },
      python: {
        before: [
          'def handle_request(request):',
          '    name = request.json["name"]',
          '    db.insert({"name": name})',
        ].join('\n'),
        after: [
          'from pydantic import BaseModel, constr',
          '',
          'class CreateInput(BaseModel):',
          '    name: constr(min_length=1, max_length=255, strip_whitespace=True)',
          '',
          'def handle_request(request):',
          '    data = CreateInput(**request.json)',
          '    db.insert({"name": data.name})',
        ].join('\n'),
        explanation:
          'Use Pydantic models to validate and sanitize input before processing.',
      },
      go: {
        before: [
          'func handleRequest(w http.ResponseWriter, r *http.Request) {',
          '\tname := r.FormValue("name")',
          '\tdb.Insert(name)',
          '}',
        ].join('\n'),
        after: [
          'import "github.com/go-playground/validator/v10"',
          '',
          'type CreateInput struct {',
          '\tName string `validate:"required,min=1,max=255"`',
          '}',
          '',
          'func handleRequest(w http.ResponseWriter, r *http.Request) {',
          '\tinput := CreateInput{Name: strings.TrimSpace(r.FormValue("name"))}',
          '\tif err := validator.New().Struct(input); err != nil {',
          '\t\thttp.Error(w, "Invalid input", http.StatusBadRequest)',
          '\t\treturn',
          '\t}',
          '\tdb.Insert(input.Name)',
          '}',
        ].join('\n'),
        explanation:
          'Use the validator package to enforce input constraints before processing.',
      },
      rust: {
        before: [
          'fn handle_request(name: &str) {',
          '    db.insert(name);',
          '}',
        ].join('\n'),
        after: [
          'use validator::Validate;',
          '',
          '#[derive(Validate)]',
          'struct CreateInput {',
          '    #[validate(length(min = 1, max = 255))]',
          '    name: String,',
          '}',
          '',
          'fn handle_request(name: &str) -> Result<(), ValidationError> {',
          '    let input = CreateInput { name: name.trim().to_string() };',
          '    input.validate()?;',
          '    db.insert(&input.name);',
          '    Ok(())',
          '}',
        ].join('\n'),
        explanation:
          'Derive Validate on input structs and call validate() before processing.',
      },
      java: {
        before: [
          'public void handleRequest(HttpServletRequest req) {',
          '    String name = req.getParameter("name");',
          '    db.insert(name);',
          '}',
        ].join('\n'),
        after: [
          'import javax.validation.constraints.*;',
          '',
          'public class CreateInput {',
          '    @NotBlank @Size(max = 255)',
          '    private String name;',
          '}',
          '',
          'public void handleRequest(@Valid CreateInput input) {',
          '    db.insert(input.getName().trim());',
          '}',
        ].join('\n'),
        explanation:
          'Use Bean Validation annotations to enforce input constraints declaratively.',
      },
    },
  },

  // Parameterized queries (SQL injection)
  {
    categories: ['injection', 'sql', 'database'],
    titlePatterns: ['sql injection', 'sqli', 'raw query', 'parameterized'],
    fixes: {
      typescript: {
        before: 'const result = await db.query(`SELECT * FROM users WHERE id = ${userId}`);',
        after: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
        explanation: 'Use parameterized queries to prevent SQL injection.',
      },
      javascript: {
        before: 'const result = await db.query(`SELECT * FROM users WHERE id = ${userId}`);',
        after: 'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
        explanation: 'Use parameterized queries with placeholders instead of string interpolation.',
      },
      python: {
        before: 'cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")',
        after: 'cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
        explanation: 'Use parameterized queries with placeholders to prevent SQL injection.',
      },
      go: {
        before: 'db.Query(fmt.Sprintf("SELECT * FROM users WHERE id = %s", userID))',
        after: 'db.Query("SELECT * FROM users WHERE id = $1", userID)',
        explanation: 'Use query parameters instead of string formatting for SQL queries.',
      },
      rust: {
        before: 'client.query(&format!("SELECT * FROM users WHERE id = {}", user_id), &[])?;',
        after: 'client.query("SELECT * FROM users WHERE id = $1", &[&user_id])?;',
        explanation: 'Use parameterized queries with the Rust postgres crate.',
      },
      java: {
        before: [
          'Statement stmt = conn.createStatement();',
          'stmt.executeQuery("SELECT * FROM users WHERE id = " + userId);',
        ].join('\n'),
        after: [
          'PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");',
          'stmt.setString(1, userId);',
          'stmt.executeQuery();',
        ].join('\n'),
        explanation: 'Use PreparedStatement with parameter binding to prevent SQL injection.',
      },
    },
  },

  // CSRF tokens
  {
    categories: ['csrf', 'session'],
    titlePatterns: ['csrf', 'cross-site request forgery'],
    fixes: {
      typescript: {
        before: [
          'app.post("/api/transfer", (req, res) => {',
          '  // No CSRF protection',
          '  processTransfer(req.body);',
          '});',
        ].join('\n'),
        after: [
          'import csrf from "csurf";',
          'const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: "strict" } });',
          '',
          'app.post("/api/transfer", csrfProtection, (req, res) => {',
          '  processTransfer(req.body);',
          '});',
        ].join('\n'),
        explanation: 'Add CSRF middleware to all state-changing endpoints.',
      },
      python: {
        before: [
          '@app.route("/api/transfer", methods=["POST"])',
          'def transfer():',
          '    process_transfer(request.json)',
        ].join('\n'),
        after: [
          'from flask_wtf.csrf import CSRFProtect',
          'csrf = CSRFProtect(app)',
          '',
          '@app.route("/api/transfer", methods=["POST"])',
          'def transfer():',
          '    process_transfer(request.json)',
        ].join('\n'),
        explanation: 'Enable Flask-WTF CSRF protection globally.',
      },
      java: {
        before: '// Spring Security CSRF is disabled\nhttp.csrf().disable();',
        after: [
          '// Enable Spring Security CSRF with cookie-based tokens',
          'http.csrf()',
          '  .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse());',
        ].join('\n'),
        explanation: 'Enable Spring Security CSRF protection with cookie-based token repository.',
      },
    },
  },

  // Auth middleware
  {
    categories: ['auth', 'access-control', 'authorization'],
    titlePatterns: ['missing auth', 'no authentication', 'unauthenticated'],
    fixes: {
      typescript: {
        before: [
          'app.get("/api/admin/users", (req, res) => {',
          '  // No authentication check',
          '  res.json(getAllUsers());',
          '});',
        ].join('\n'),
        after: [
          'function requireAuth(req: Request, res: Response, next: NextFunction) {',
          '  const token = req.headers.authorization?.split(" ")[1];',
          '  if (!token) return res.status(401).json({ error: "Unauthorized" });',
          '  try {',
          '    req.user = jwt.verify(token, process.env.JWT_SECRET!);',
          '    next();',
          '  } catch {',
          '    res.status(401).json({ error: "Invalid token" });',
          '  }',
          '}',
          '',
          'app.get("/api/admin/users", requireAuth, (req, res) => {',
          '  res.json(getAllUsers());',
          '});',
        ].join('\n'),
        explanation: 'Add JWT authentication middleware to protect sensitive endpoints.',
      },
      python: {
        before: [
          '@app.route("/api/admin/users")',
          'def get_users():',
          '    return jsonify(get_all_users())',
        ].join('\n'),
        after: [
          'from functools import wraps',
          'from flask_jwt_extended import jwt_required',
          '',
          '@app.route("/api/admin/users")',
          '@jwt_required()',
          'def get_users():',
          '    return jsonify(get_all_users())',
        ].join('\n'),
        explanation: 'Use Flask-JWT-Extended decorator to require authentication.',
      },
      go: {
        before: [
          'http.HandleFunc("/api/admin/users", getUsers)',
        ].join('\n'),
        after: [
          'http.Handle("/api/admin/users", authMiddleware(http.HandlerFunc(getUsers)))',
          '',
          'func authMiddleware(next http.Handler) http.Handler {',
          '\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {',
          '\t\ttoken := r.Header.Get("Authorization")',
          '\t\tif token == "" {',
          '\t\t\thttp.Error(w, "Unauthorized", http.StatusUnauthorized)',
          '\t\t\treturn',
          '\t\t}',
          '\t\tnext.ServeHTTP(w, r)',
          '\t})',
          '}',
        ].join('\n'),
        explanation: 'Wrap route handlers with authentication middleware in Go.',
      },
    },
  },

  // Secret management
  {
    categories: ['secrets', 'credentials', 'hardcoded'],
    titlePatterns: ['hardcoded secret', 'hardcoded password', 'hardcoded key', 'api key in'],
    fixes: {
      typescript: {
        before: 'const API_KEY = "sk-1234567890abcdef";',
        after: [
          'const API_KEY = process.env.API_KEY;',
          'if (!API_KEY) {',
          '  throw new Error("API_KEY environment variable is required");',
          '}',
        ].join('\n'),
        explanation: 'Move secrets to environment variables and validate their presence at startup.',
      },
      javascript: {
        before: 'const API_KEY = "sk-1234567890abcdef";',
        after: [
          'const API_KEY = process.env.API_KEY;',
          'if (!API_KEY) {',
          '  throw new Error("API_KEY environment variable is required");',
          '}',
        ].join('\n'),
        explanation: 'Load secrets from environment variables instead of hardcoding them.',
      },
      python: {
        before: 'API_KEY = "sk-1234567890abcdef"',
        after: [
          'import os',
          '',
          'API_KEY = os.environ["API_KEY"]  # Raises KeyError if missing',
        ].join('\n'),
        explanation: 'Read secrets from environment variables using os.environ.',
      },
      go: {
        before: 'const apiKey = "sk-1234567890abcdef"',
        after: [
          'apiKey := os.Getenv("API_KEY")',
          'if apiKey == "" {',
          '\tlog.Fatal("API_KEY environment variable is required")',
          '}',
        ].join('\n'),
        explanation: 'Read secrets from environment variables using os.Getenv.',
      },
      rust: {
        before: 'let api_key = "sk-1234567890abcdef";',
        after: [
          'let api_key = std::env::var("API_KEY")',
          '    .expect("API_KEY environment variable is required");',
        ].join('\n'),
        explanation: 'Read secrets from environment variables using std::env::var.',
      },
      java: {
        before: 'private static final String API_KEY = "sk-1234567890abcdef";',
        after: [
          'private static final String API_KEY = System.getenv("API_KEY");',
          'static {',
          '    if (API_KEY == null || API_KEY.isEmpty()) {',
          '        throw new IllegalStateException("API_KEY environment variable is required");',
          '    }',
          '}',
        ].join('\n'),
        explanation: 'Read secrets from environment variables using System.getenv().',
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function matchesTemplate(finding: Finding, template: FixTemplate): boolean {
  const cat = finding.category.toLowerCase();
  const title = finding.title.toLowerCase();

  const categoryMatch = template.categories.some((c) =>
    cat.includes(c.toLowerCase()),
  );
  const titleMatch = template.titlePatterns.some((p) =>
    title.includes(p.toLowerCase()),
  );

  return categoryMatch || titleMatch;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a code fix for a finding in a specific language.
 *
 * Returns `undefined` if no template matches the finding/language combo.
 */
export function generateCodeFix(
  finding: Finding,
  language: FixLanguage,
): CodeFix | undefined {
  for (const template of FIX_TEMPLATES) {
    if (matchesTemplate(finding, template)) {
      const fix = template.fixes[language];
      if (fix) return fix;
    }
  }
  return undefined;
}

/**
 * Returns all supported languages.
 */
export function getSupportedLanguages(): FixLanguage[] {
  return ['typescript', 'javascript', 'python', 'go', 'rust', 'java'];
}
