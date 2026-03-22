import {describe, it, expect} from 'vitest';

import type {AugmentaSecConfig} from '../../config/schema.js';
import {DEFAULT_CONFIG} from '../../config/defaults.js';
import type {Finding} from '../../findings/types.js';
import {determineAction} from '../autonomy.js';

/** Creates a minimal Finding with the given severity. */
function makeFinding(severity: Finding['severity']): Finding {
  return {
    id: 'test-id',
    source: 'scanner',
    category: 'injection',
    severity,
    rawSeverity: severity,
    title: 'Test finding',
    description: 'Test description',
    confidence: 0.8,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('determineAction', () => {
  it('maps critical findings to "create-pr-and-alert" with default config', () => {
    const decision = determineAction(makeFinding('critical'), DEFAULT_CONFIG);

    expect(decision.action).toBe('create-pr-and-alert');
    expect(decision.severity).toBe('critical');
    expect(decision.reason).toContain('critical');
  });

  it('maps high findings to "create-issue" with default config', () => {
    const decision = determineAction(makeFinding('high'), DEFAULT_CONFIG);

    expect(decision.action).toBe('create-issue');
    expect(decision.severity).toBe('high');
  });

  it('maps medium findings to "report" with default config', () => {
    const decision = determineAction(makeFinding('medium'), DEFAULT_CONFIG);

    expect(decision.action).toBe('report');
  });

  it('maps low findings to "note" with default config', () => {
    const decision = determineAction(makeFinding('low'), DEFAULT_CONFIG);

    expect(decision.action).toBe('note');
  });

  it('maps informational findings to "note" regardless of config', () => {
    const decision = determineAction(
      makeFinding('informational'),
      DEFAULT_CONFIG,
    );

    expect(decision.action).toBe('note');
    expect(decision.reason).toContain('informational');
  });

  it('uses custom autonomy config when provided', () => {
    const config: AugmentaSecConfig = {
      ...DEFAULT_CONFIG,
      autonomy: {
        ...DEFAULT_CONFIG.autonomy,
        high: 'create-pr-and-alert',
        medium: 'create-issue',
      },
    };

    expect(determineAction(makeFinding('high'), config).action).toBe(
      'create-pr-and-alert',
    );
    expect(determineAction(makeFinding('medium'), config).action).toBe(
      'create-issue',
    );
  });

  it('returns a descriptive reason for each decision', () => {
    const decision = determineAction(makeFinding('high'), DEFAULT_CONFIG);

    expect(decision.reason).toMatch(/severity.*high.*action.*create-issue/i);
  });
});
