import {describe, it, expect} from 'vitest';
import type {DetectorContext} from '../../types.js';
import {iacDetector} from '../iac.js';

function createMockContext(
  files: Record<string, string>,
): DetectorContext {
  return {
    rootDir: '/mock',
    findFiles: async (patterns: string[]) => {
      return Object.keys(files).filter(f =>
        patterns.some(p => {
          if (p.startsWith('**/')) {
            const rest = p.slice(3);
            if (rest.startsWith('*.')) {
              return f.endsWith(rest.slice(1));
            }
            if (rest.includes('*')) {
              const regex = new RegExp(
                rest
                  .replace(/\./g, '\\.')
                  .replace(/\*\*/g, '.*')
                  .replace(/\*/g, '[^/]*'),
              );
              return regex.test(f);
            }
            return f === rest || f.endsWith('/' + rest);
          }
          if (p.includes('*')) {
            const regex = new RegExp(
              '^' +
                p
                  .replace(/\./g, '\\.')
                  .replace(/\*\*/g, '.*')
                  .replace(/\*/g, '[^/]*')
                  .replace(/\//g, '\\/') +
                '$',
            );
            return regex.test(f);
          }
          return f === p || f.endsWith('/' + p);
        }),
      );
    },
    readFile: async (path: string) => files[path] ?? null,
    readJson: async <T = unknown>(path: string) => {
      const content = files[path];
      if (!content) return null;
      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    },
    readYaml: async <T = unknown>(_path: string) => null as T,
    fileExists: async (path: string) => path in files,
    grep: async () => [],
  };
}

describe('iacDetector', () => {
  it('detects Terraform with AWS provider', async () => {
    const ctx = createMockContext({
      'infra/main.tf': [
        'provider "aws" {',
        '  region = "us-east-1"',
        '}',
        '',
        'resource "aws_s3_bucket" "data" {',
        '  bucket = "my-bucket"',
        '}',
      ].join('\n'),
      'infra/variables.tf': 'variable "region" {\n  default = "us-east-1"\n}',
    });

    const result = await iacDetector.detect(ctx);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].tool).toBe('terraform');
    expect(result.tools[0].files).toHaveLength(2);
    expect(result.tools[0].providers).toContain('aws');
  });

  it('detects Terraform with multiple providers', async () => {
    const ctx = createMockContext({
      'infra/main.tf': [
        'provider "aws" { region = "eu-west-1" }',
        'provider "google" { project = "my-project" }',
      ].join('\n'),
    });

    const result = await iacDetector.detect(ctx);
    const tf = result.tools.find(t => t.tool === 'terraform');
    expect(tf).toBeDefined();
    expect(tf!.providers).toContain('aws');
    expect(tf!.providers).toContain('google');
  });

  it('detects Pulumi', async () => {
    const ctx = createMockContext({
      'Pulumi.yaml': 'name: my-stack\nruntime: nodejs\n',
      'Pulumi.dev.yaml': 'config:\n  aws:region: us-east-1\n',
    });

    const result = await iacDetector.detect(ctx);
    const pulumi = result.tools.find(t => t.tool === 'pulumi');
    expect(pulumi).toBeDefined();
    expect(pulumi!.files.length).toBeGreaterThanOrEqual(1);
  });

  it('detects CDK from package.json dependencies', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {'aws-cdk-lib': '^2.100.0'},
        devDependencies: {'aws-cdk': '^2.100.0'},
      }),
      'cdk.json': '{"app": "npx ts-node bin/app.ts"}',
    });

    const result = await iacDetector.detect(ctx);
    const cdk = result.tools.find(t => t.tool === 'cdk');
    expect(cdk).toBeDefined();
    expect(cdk!.providers).toContain('aws');
  });

  it('detects Helm charts', async () => {
    const ctx = createMockContext({
      'charts/api/Chart.yaml': 'apiVersion: v2\nname: api\nversion: 1.0.0\n',
      'package.json': JSON.stringify({name: 'app'}),
    });

    const result = await iacDetector.detect(ctx);
    const helm = result.tools.find(t => t.tool === 'helm');
    expect(helm).toBeDefined();
    expect(helm!.files).toContain('charts/api/Chart.yaml');
  });

  it('detects Ansible playbooks', async () => {
    const ctx = createMockContext({
      'deploy/playbook.yml': '---\n- hosts: all\n  tasks:\n    - name: install\n',
      'package.json': JSON.stringify({name: 'app'}),
    });

    const result = await iacDetector.detect(ctx);
    const ansible = result.tools.find(t => t.tool === 'ansible');
    expect(ansible).toBeDefined();
  });

  it('returns empty tools when no IaC found', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({name: 'simple-app'}),
      'src/index.ts': 'console.log("hello")',
    });

    const result = await iacDetector.detect(ctx);
    expect(result.tools).toHaveLength(0);
  });

  it('detects CloudFormation templates', async () => {
    const ctx = createMockContext({
      'cloudformation/stack.template.yaml':
        'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  Bucket:\n    Type: AWS::S3::Bucket\n',
      'package.json': JSON.stringify({name: 'app'}),
    });

    const result = await iacDetector.detect(ctx);
    const cfn = result.tools.find(t => t.tool === 'cloudformation');
    expect(cfn).toBeDefined();
    expect(cfn!.providers).toContain('aws');
  });

  it('detects multiple IaC tools in the same project', async () => {
    const ctx = createMockContext({
      'infra/main.tf': 'provider "aws" { region = "us-east-1" }',
      'charts/web/Chart.yaml': 'apiVersion: v2\nname: web\n',
      'package.json': JSON.stringify({name: 'app'}),
    });

    const result = await iacDetector.detect(ctx);
    expect(result.tools.length).toBeGreaterThanOrEqual(2);
    const toolNames = result.tools.map(t => t.tool);
    expect(toolNames).toContain('terraform');
    expect(toolNames).toContain('helm');
  });

  it('detects standalone template.yaml as CloudFormation', async () => {
    const ctx = createMockContext({
      'template.yaml':
        'AWSTemplateFormatVersion: "2010-09-09"\nResources:\n  MyFunc:\n    Type: AWS::Lambda::Function\n',
      'package.json': JSON.stringify({name: 'sam-app'}),
    });

    const result = await iacDetector.detect(ctx);
    const cfn = result.tools.find(t => t.tool === 'cloudformation');
    expect(cfn).toBeDefined();
    expect(cfn!.files).toContain('template.yaml');
  });

  it('detects standalone template.yml as CloudFormation', async () => {
    const ctx = createMockContext({
      'template.yml':
        'AWSTemplateFormatVersion: "2010-09-09"\nResources: {}\n',
      'package.json': JSON.stringify({name: 'sam-app'}),
    });

    const result = await iacDetector.detect(ctx);
    const cfn = result.tools.find(t => t.tool === 'cloudformation');
    expect(cfn).toBeDefined();
    expect(cfn!.files).toContain('template.yml');
  });

  it('detects standalone template.json as CloudFormation', async () => {
    const ctx = createMockContext({
      'template.json':
        '{"AWSTemplateFormatVersion": "2010-09-09", "Resources": {}}',
      'package.json': JSON.stringify({name: 'sam-app'}),
    });

    const result = await iacDetector.detect(ctx);
    const cfn = result.tools.find(t => t.tool === 'cloudformation');
    expect(cfn).toBeDefined();
    expect(cfn!.files).toContain('template.json');
  });

  it('ignores standalone template without CloudFormation marker', async () => {
    const ctx = createMockContext({
      'template.yaml': 'just: some\nrandom: yaml\n',
      'package.json': JSON.stringify({name: 'app'}),
    });

    const result = await iacDetector.detect(ctx);
    const cfn = result.tools.find(t => t.tool === 'cloudformation');
    expect(cfn).toBeUndefined();
  });

  it('detects CDK from scoped @aws-cdk packages', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        devDependencies: {'@aws-cdk/core': '^1.130.0'},
      }),
    });

    const result = await iacDetector.detect(ctx);
    const cdk = result.tools.find(t => t.tool === 'cdk');
    expect(cdk).toBeDefined();
    expect(cdk!.providers).toContain('aws');
  });
});
