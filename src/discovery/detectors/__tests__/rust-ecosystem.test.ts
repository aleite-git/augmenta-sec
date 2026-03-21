import {describe, it, expect} from 'vitest';
import {rustEcosystemDetector} from '../rust-ecosystem.js';
import {createMockContext} from './helpers.js';

describe('rustEcosystemDetector', () => {
  it('returns detected=false when no Cargo.toml exists', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.hasCargoLock).toBe(false);
    expect(result.frameworks).toEqual([]);
    expect(result.securityDeps).toEqual([]);
    expect(result.isWorkspace).toBe(false);
    expect(result.workspaceMembers).toEqual([]);
  });

  it('detects a basic Rust project from Cargo.toml', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "myapp"',
        'edition = "2021"',
        'rust-version = "1.75"',
        '',
        '[dependencies]',
        'actix-web = "4"',
        'serde = { version = "1", features = ["derive"] }',
        'tokio = { version = "1", features = ["full"] }',
      ].join('\n'),
      'Cargo.lock': [
        '[[package]]',
        'name = "actix-web"',
        'version = "4.4.0"',
        '',
        '[[package]]',
        'name = "serde"',
        'version = "1.0.190"',
        '',
        '[[package]]',
        'name = "tokio"',
        'version = "1.35.0"',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.cargoTomlFile).toBe('Cargo.toml');
    expect(result.edition).toBe('2021');
    expect(result.rustVersion).toBe('1.75');
    expect(result.hasCargoLock).toBe(true);
    expect(result.crateCount).toBe(3);
    expect(result.frameworks).toContain('actix-web');
    expect(result.frameworks).toContain('serde');
    expect(result.frameworks).toContain('tokio');
  });

  it('detects unsafe blocks in Rust files', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "myapp"',
        'edition = "2021"',
        '',
        '[dependencies]',
      ].join('\n'),
      'src/main.rs': [
        'fn main() {',
        '    unsafe {',
        '        // raw pointer deref',
        '    }',
        '}',
      ].join('\n'),
      'src/lib.rs': [
        'pub unsafe fn dangerous() {}',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.hasUnsafeBlocks).toBe(true);
    expect(result.unsafeFileCount).toBe(2);
  });

  it('detects workspace with members', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[workspace]',
        'members = ["crates/core", "crates/web", "crates/cli"]',
        '',
        '[workspace.dependencies]',
        'serde = "1"',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.isWorkspace).toBe(true);
    expect(result.workspaceMembers).toEqual(['crates/core', 'crates/web', 'crates/cli']);
  });

  it('detects workspace with multi-line members array', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[workspace]',
        'members = [',
        '  "services/api",',
        '  "services/worker",',
        ']',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.isWorkspace).toBe(true);
    expect(result.workspaceMembers).toContain('services/api');
    expect(result.workspaceMembers).toContain('services/worker');
  });

  it('detects security-related crates', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "secure-app"',
        'edition = "2021"',
        '',
        '[dependencies]',
        'rustls = "0.22"',
        'jsonwebtoken = "9"',
        'argon2 = "0.5"',
        'tracing = "0.1"',
        'secrecy = "0.8"',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.securityDeps).toContain('rustls');
    expect(result.securityDeps).toContain('jsonwebtoken');
    expect(result.securityDeps).toContain('argon2');
    expect(result.securityDeps).toContain('tracing');
    expect(result.securityDeps).toContain('secrecy');
  });

  it('handles Cargo.toml without Cargo.lock', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "mylib"',
        'edition = "2021"',
        '',
        '[dependencies]',
        'axum = "0.7"',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.hasCargoLock).toBe(false);
    expect(result.crateCount).toBe(0);
    expect(result.frameworks).toContain('axum');
  });

  it('detects no unsafe when none present', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "safe-app"',
        'edition = "2021"',
        '',
        '[dependencies]',
      ].join('\n'),
      'src/main.rs': 'fn main() { println!("Hello"); }',
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.hasUnsafeBlocks).toBe(false);
    expect(result.unsafeFileCount).toBe(0);
  });

  it('counts crates in Cargo.lock correctly', async () => {
    const ctx = createMockContext({
      'Cargo.toml': [
        '[package]',
        'name = "myapp"',
        'edition = "2021"',
        '',
        '[dependencies]',
        'warp = "0.3"',
      ].join('\n'),
      'Cargo.lock': [
        '[[package]]',
        'name = "warp"',
        'version = "0.3.6"',
        '',
        '[[package]]',
        'name = "hyper"',
        'version = "0.14.27"',
        '',
        '[[package]]',
        'name = "tokio"',
        'version = "1.35.0"',
        '',
        '[[package]]',
        'name = "serde"',
        'version = "1.0.190"',
        '',
        '[[package]]',
        'name = "myapp"',
        'version = "0.1.0"',
      ].join('\n'),
    });

    const result = await rustEcosystemDetector.detect(ctx);

    expect(result.crateCount).toBe(5);
    expect(result.frameworks).toContain('warp');
  });

  it('has correct detector name', () => {
    expect(rustEcosystemDetector.name).toBe('rust-ecosystem');
  });
});
