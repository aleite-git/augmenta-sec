import {describe, expect, it} from 'vitest';
import {
  validateRequest,
  scanRequestSchema,
  profileRequestSchema,
  webhookRegisterSchema,
  type RequestSchema,
} from '../validation.js';

// ---------------------------------------------------------------------------
// validateRequest tests
// ---------------------------------------------------------------------------

describe('validateRequest', () => {
  describe('basic validation', () => {
    it('returns valid for a correct body', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
        count: {type: 'number', required: false},
      };

      const result = validateRequest({name: 'test', count: 5}, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null body', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
      };

      const result = validateRequest(null, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('JSON object');
    });

    it('rejects undefined body', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
      };

      const result = validateRequest(undefined, schema);
      expect(result.valid).toBe(false);
    });

    it('rejects array body', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
      };

      const result = validateRequest([1, 2, 3], schema);
      expect(result.valid).toBe(false);
    });

    it('rejects non-object body', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
      };

      const result = validateRequest('hello', schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('required fields', () => {
    it('reports missing required fields', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
        email: {type: 'string', required: true},
      };

      const result = validateRequest({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('name');
      expect(result.errors[1]).toContain('email');
    });

    it('allows missing optional fields', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
        nickname: {type: 'string', required: false},
      };

      const result = validateRequest({name: 'Alice'}, schema);
      expect(result.valid).toBe(true);
    });

    it('treats fields with no required flag as optional', () => {
      const schema: RequestSchema = {
        name: {type: 'string'},
      };

      const result = validateRequest({}, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('type checking', () => {
    it('rejects wrong type for string field', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
      };

      const result = validateRequest({name: 123}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('string');
    });

    it('rejects wrong type for number field', () => {
      const schema: RequestSchema = {
        count: {type: 'number', required: true},
      };

      const result = validateRequest({count: 'five'}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('number');
    });

    it('rejects wrong type for boolean field', () => {
      const schema: RequestSchema = {
        active: {type: 'boolean', required: true},
      };

      const result = validateRequest({active: 'yes'}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('boolean');
    });

    it('validates object type', () => {
      const schema: RequestSchema = {
        config: {type: 'object', required: true},
      };

      const result = validateRequest({config: {key: 'value'}}, schema);
      expect(result.valid).toBe(true);
    });

    it('rejects array for object type', () => {
      const schema: RequestSchema = {
        config: {type: 'object', required: true},
      };

      const result = validateRequest({config: [1, 2]}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('object');
    });
  });

  describe('string validations', () => {
    it('validates minLength', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true, minLength: 3},
      };

      const result = validateRequest({name: 'ab'}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 3');
    });

    it('validates maxLength', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true, maxLength: 5},
      };

      const result = validateRequest({name: 'toolongname'}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 5');
    });

    it('validates pattern', () => {
      const schema: RequestSchema = {
        email: {type: 'string', required: true, pattern: /^.+@.+\..+$/},
      };

      const good = validateRequest({email: 'a@b.com'}, schema);
      expect(good.valid).toBe(true);

      const bad = validateRequest({email: 'not-an-email'}, schema);
      expect(bad.valid).toBe(false);
      expect(bad.errors[0]).toContain('pattern');
    });
  });

  describe('number validations', () => {
    it('validates min', () => {
      const schema: RequestSchema = {
        count: {type: 'number', required: true, min: 1},
      };

      const result = validateRequest({count: 0}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 1');
    });

    it('validates max', () => {
      const schema: RequestSchema = {
        count: {type: 'number', required: true, max: 100},
      };

      const result = validateRequest({count: 101}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 100');
    });
  });

  describe('multiple errors', () => {
    it('collects all validation errors', () => {
      const schema: RequestSchema = {
        name: {type: 'string', required: true},
        count: {type: 'number', required: true},
        active: {type: 'boolean', required: true},
      };

      const result = validateRequest({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Predefined schema tests
// ---------------------------------------------------------------------------

describe('scanRequestSchema', () => {
  it('accepts valid scan request', () => {
    const result = validateRequest(
      {target: '/path/to/project'},
      scanRequestSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts scan request with config', () => {
    const result = validateRequest(
      {target: '/my/project', config: {categories: ['auth']}},
      scanRequestSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects missing target', () => {
    const result = validateRequest({}, scanRequestSchema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('target');
  });

  it('rejects empty target', () => {
    const result = validateRequest({target: ''}, scanRequestSchema);
    expect(result.valid).toBe(false);
  });

  it('rejects target with dangerous characters', () => {
    const result = validateRequest(
      {target: '<script>alert(1)</script>'},
      scanRequestSchema,
    );
    expect(result.valid).toBe(false);
  });
});

describe('profileRequestSchema', () => {
  it('accepts valid profile request', () => {
    const result = validateRequest(
      {target: '/path/to/project'},
      profileRequestSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects missing target', () => {
    const result = validateRequest({}, profileRequestSchema);
    expect(result.valid).toBe(false);
  });
});

describe('webhookRegisterSchema', () => {
  it('accepts valid webhook URL', () => {
    const result = validateRequest(
      {url: 'https://example.com/webhook'},
      webhookRegisterSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts http URL', () => {
    const result = validateRequest(
      {url: 'http://localhost:8080/hook'},
      webhookRegisterSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects missing URL', () => {
    const result = validateRequest({}, webhookRegisterSchema);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = validateRequest(
      {url: 'not-a-url'},
      webhookRegisterSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('pattern');
  });
});
