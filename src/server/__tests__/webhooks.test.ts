import {createHmac} from 'node:crypto';
import {describe, it, expect} from 'vitest';
import {
  handleGitHubWebhook,
  handleGitLabWebhook,
  verifyGitHubSignature,
  verifyGitLabToken,
} from '../webhooks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signGitHub(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// verifyGitHubSignature
// ---------------------------------------------------------------------------

describe('verifyGitHubSignature', () => {
  const secret = 'test-secret';
  const body = '{"action":"opened"}';

  it('accepts a valid signature', () => {
    const sig = signGitHub(body, secret);
    expect(() => verifyGitHubSignature(body, sig, secret)).not.toThrow();
  });

  it('rejects missing signature', () => {
    expect(() => verifyGitHubSignature(body, '', secret)).toThrow(
      'Missing GitHub webhook signature',
    );
  });

  it('rejects invalid signature', () => {
    expect(() =>
      verifyGitHubSignature(body, 'sha256=bad', secret),
    ).toThrow('Invalid GitHub webhook signature');
  });

  it('rejects tampered body', () => {
    const sig = signGitHub(body, secret);
    expect(() =>
      verifyGitHubSignature('{"action":"closed"}', sig, secret),
    ).toThrow('Invalid GitHub webhook signature');
  });

  it('rejects wrong secret', () => {
    const sig = signGitHub(body, secret);
    expect(() =>
      verifyGitHubSignature(body, sig, 'wrong-secret'),
    ).toThrow('Invalid GitHub webhook signature');
  });
});

// ---------------------------------------------------------------------------
// verifyGitLabToken
// ---------------------------------------------------------------------------

describe('verifyGitLabToken', () => {
  it('accepts a valid token', () => {
    expect(() => verifyGitLabToken('my-secret', 'my-secret')).not.toThrow();
  });

  it('rejects missing token', () => {
    expect(() => verifyGitLabToken('', 'my-secret')).toThrow(
      'Missing GitLab webhook token',
    );
  });

  it('rejects mismatched token', () => {
    expect(() => verifyGitLabToken('wrong', 'my-secret')).toThrow(
      'Invalid GitLab webhook token',
    );
  });
});

// ---------------------------------------------------------------------------
// handleGitHubWebhook
// ---------------------------------------------------------------------------

describe('handleGitHubWebhook', () => {
  const secret = 'gh-secret';

  function makePayload(payload: object): {body: string; sig: string} {
    const body = JSON.stringify(payload);
    return {body, sig: signGitHub(body, secret)};
  }

  it('triggers review on PR opened', () => {
    const {body, sig} = makePayload({
      action: 'opened',
      repository: {full_name: 'org/repo'},
      pull_request: {head: {ref: 'feat/x'}},
    });
    const result = handleGitHubWebhook(body, sig, secret, 'pull_request');
    expect(result.action).toBe('review');
    expect(result.repo).toBe('org/repo');
    expect(result.ref).toBe('feat/x');
    expect(result.event).toBe('pull_request.opened');
  });

  it('triggers review on PR synchronize', () => {
    const {body, sig} = makePayload({
      action: 'synchronize',
      repository: {full_name: 'org/repo'},
      pull_request: {head: {ref: 'feat/y'}},
    });
    const result = handleGitHubWebhook(body, sig, secret, 'pull_request');
    expect(result.action).toBe('review');
    expect(result.event).toBe('pull_request.synchronize');
  });

  it('triggers scan on push', () => {
    const {body, sig} = makePayload({
      ref: 'refs/heads/main',
      repository: {full_name: 'org/repo'},
    });
    const result = handleGitHubWebhook(body, sig, secret, 'push');
    expect(result.action).toBe('scan');
    expect(result.ref).toBe('refs/heads/main');
    expect(result.event).toBe('push');
  });

  it('returns none for unrecognized events', () => {
    const {body, sig} = makePayload({
      repository: {full_name: 'org/repo'},
    });
    const result = handleGitHubWebhook(body, sig, secret, 'issues');
    expect(result.action).toBe('none');
    expect(result.event).toBe('issues');
  });

  it('returns none for PR closed', () => {
    const {body, sig} = makePayload({
      action: 'closed',
      repository: {full_name: 'org/repo'},
      pull_request: {head: {ref: 'feat/x'}},
    });
    const result = handleGitHubWebhook(body, sig, secret, 'pull_request');
    expect(result.action).toBe('none');
  });

  it('handles missing repository gracefully', () => {
    const {body, sig} = makePayload({ref: 'refs/heads/main'});
    const result = handleGitHubWebhook(body, sig, secret, 'push');
    expect(result.repo).toBe('unknown/unknown');
  });

  it('throws on invalid signature', () => {
    const body = JSON.stringify({ref: 'main', repository: {full_name: 'org/repo'}});
    expect(() =>
      handleGitHubWebhook(body, 'sha256=bad', secret, 'push'),
    ).toThrow('Invalid GitHub webhook signature');
  });
});

// ---------------------------------------------------------------------------
// handleGitLabWebhook
// ---------------------------------------------------------------------------

describe('handleGitLabWebhook', () => {
  const secret = 'gl-secret';

  it('triggers review on merge request opened', () => {
    const body = JSON.stringify({
      object_kind: 'merge_request',
      object_attributes: {action: 'open', source_branch: 'feat/z'},
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('review');
    expect(result.repo).toBe('group/project');
    expect(result.ref).toBe('feat/z');
    expect(result.event).toBe('merge_request.open');
  });

  it('triggers review on merge request update', () => {
    const body = JSON.stringify({
      object_kind: 'merge_request',
      object_attributes: {action: 'update', source_branch: 'feat/z'},
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('review');
    expect(result.event).toBe('merge_request.update');
  });

  it('triggers scan on push', () => {
    const body = JSON.stringify({
      object_kind: 'push',
      ref: 'refs/heads/main',
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('scan');
    expect(result.ref).toBe('refs/heads/main');
    expect(result.event).toBe('push');
  });

  it('returns none for unrecognized events', () => {
    const body = JSON.stringify({
      object_kind: 'pipeline',
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('none');
    expect(result.event).toBe('pipeline');
  });

  it('returns none for MR close', () => {
    const body = JSON.stringify({
      object_kind: 'merge_request',
      object_attributes: {action: 'close', source_branch: 'feat/z'},
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('none');
  });

  it('handles missing project gracefully', () => {
    const body = JSON.stringify({object_kind: 'push', ref: 'main'});
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.repo).toBe('unknown/unknown');
  });

  it('throws on invalid token', () => {
    const body = JSON.stringify({object_kind: 'push'});
    expect(() => handleGitLabWebhook(body, 'wrong', secret)).toThrow(
      'Invalid GitLab webhook token',
    );
  });

  it('falls back to event_type when object_kind is missing', () => {
    const body = JSON.stringify({
      event_type: 'push',
      ref: 'refs/heads/dev',
      project: {path_with_namespace: 'group/project'},
    });
    const result = handleGitLabWebhook(body, secret, secret);
    expect(result.action).toBe('scan');
  });
});
