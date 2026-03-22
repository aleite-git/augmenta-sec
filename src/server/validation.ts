/**
 * Request body validation for the HTTP server.
 *
 * Provides a lightweight schema-based validator that does not depend on
 * external libraries (Zod is available in the project but we keep this
 * module self-contained for the server layer).
 *
 * @module ASEC-085
 */

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export type RequestSchema = Record<string, FieldSchema>;

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validates a request body against a schema definition.
 *
 * @param body The parsed request body (should be a plain object).
 * @param schema The schema to validate against.
 * @returns A {@link ValidationResult} with errors if validation fails.
 */
export function validateRequest(
  body: unknown,
  schema: RequestSchema,
): ValidationResult {
  const errors: string[] = [];

  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return {valid: false, errors: ['Request body must be a JSON object']};
  }

  const record = body as Record<string, unknown>;

  for (const [field, fieldSchema] of Object.entries(schema)) {
    const value = record[field];

    // Check required
    if (fieldSchema.required && (value === undefined || value === null)) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    // Skip optional fields that are not present
    if (value === undefined || value === null) {
      continue;
    }

    // Type check
    const actualType = typeof value;
    if (fieldSchema.type === 'object') {
      if (actualType !== 'object' || Array.isArray(value)) {
        errors.push(`Field "${field}" must be an object`);
        continue;
      }
    } else if (actualType !== fieldSchema.type) {
      errors.push(
        `Field "${field}" must be of type ${fieldSchema.type}, got ${actualType}`,
      );
      continue;
    }

    // String-specific validations
    if (fieldSchema.type === 'string' && typeof value === 'string') {
      if (
        fieldSchema.minLength !== undefined &&
        value.length < fieldSchema.minLength
      ) {
        errors.push(
          `Field "${field}" must be at least ${fieldSchema.minLength} characters`,
        );
      }
      if (
        fieldSchema.maxLength !== undefined &&
        value.length > fieldSchema.maxLength
      ) {
        errors.push(
          `Field "${field}" must be at most ${fieldSchema.maxLength} characters`,
        );
      }
      if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
        errors.push(`Field "${field}" does not match the required pattern`);
      }
    }

    // Number-specific validations
    if (fieldSchema.type === 'number' && typeof value === 'number') {
      if (fieldSchema.min !== undefined && value < fieldSchema.min) {
        errors.push(
          `Field "${field}" must be at least ${fieldSchema.min}`,
        );
      }
      if (fieldSchema.max !== undefined && value > fieldSchema.max) {
        errors.push(
          `Field "${field}" must be at most ${fieldSchema.max}`,
        );
      }
    }
  }

  return {valid: errors.length === 0, errors};
}

// ---------------------------------------------------------------------------
// Predefined schemas
// ---------------------------------------------------------------------------

/** Schema for POST /api/scan requests. */
export const scanRequestSchema: RequestSchema = {
  target: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 1024,
    pattern: /^[a-zA-Z0-9_./@:~-][a-zA-Z0-9_./@:~ -]*$/,
  },
  config: {
    type: 'object',
    required: false,
  },
};

/** Schema for POST /api/profile requests. */
export const profileRequestSchema: RequestSchema = {
  target: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 1024,
    pattern: /^[a-zA-Z0-9_./@:~-][a-zA-Z0-9_./@:~ -]*$/,
  },
};

/** Schema for POST /api/webhooks/register requests. */
export const webhookRegisterSchema: RequestSchema = {
  url: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 2048,
    pattern: /^https?:\/\/.+/,
  },
};
