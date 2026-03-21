import type {Detector, DetectorContext, IaCInfo, IaCEntry} from '../types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Extracts Terraform provider names from .tf file content.
 * Looks for `provider "aws" {` style blocks.
 */
function extractTerraformProviders(content: string): string[] {
  const providers: string[] = [];
  const regex = /provider\s+"([^"]+)"/g;
  let match = regex.exec(content);
  while (match) {
    providers.push(match[1]);
    match = regex.exec(content);
  }
  return providers;
}

export const iacDetector: Detector<IaCInfo> = {
  name: 'iac',

  async detect(ctx: DetectorContext): Promise<IaCInfo> {
    const tools: IaCEntry[] = [];

    // ── Terraform ──
    const tfFiles = await ctx.findFiles(['**/*.tf']);
    if (tfFiles.length > 0) {
      const providers = new Set<string>();
      for (const file of tfFiles) {
        const content = await ctx.readFile(file);
        if (!content) continue;
        for (const p of extractTerraformProviders(content)) {
          providers.add(p);
        }
      }
      tools.push({
        tool: 'terraform',
        files: tfFiles,
        providers: [...providers],
      });
    }

    // ── Pulumi ──
    const hasPulumi = await ctx.fileExists('Pulumi.yaml');
    if (hasPulumi) {
      const pulumiFiles = await ctx.findFiles(['Pulumi.yaml', 'Pulumi.*.yaml']);
      tools.push({tool: 'pulumi', files: pulumiFiles});
    }

    // ── AWS CDK ──
    const rootPkg = await ctx.readJson<PackageJson>('package.json');
    if (rootPkg) {
      const allDeps = {
        ...(rootPkg.dependencies ?? {}),
        ...(rootPkg.devDependencies ?? {}),
      };
      const hasCdk = Object.keys(allDeps).some(
        dep => dep === 'aws-cdk-lib' || dep.startsWith('@aws-cdk/'),
      );
      if (hasCdk) {
        // Find CDK-related files
        const cdkFiles = await ctx.findFiles([
          'cdk.json',
          '**/cdk.json',
          '**/cdk/**/*.ts',
          '**/cdk/**/*.js',
        ]);
        tools.push({
          tool: 'cdk',
          files: cdkFiles.length > 0 ? cdkFiles : ['package.json'],
          providers: ['aws'],
        });
      }
    }

    // ── CloudFormation ──
    const cfnCandidates = await ctx.findFiles([
      '**/*.template.json',
      '**/*.template.yaml',
      '**/*.template.yml',
      '**/cloudformation/**/*.json',
      '**/cloudformation/**/*.yaml',
      '**/cloudformation/**/*.yml',
    ]);
    const cfnFiles: string[] = [];
    for (const file of cfnCandidates) {
      const content = await ctx.readFile(file);
      if (content && content.includes('AWSTemplateFormatVersion')) {
        cfnFiles.push(file);
      }
    }
    // Also check common standalone template names
    for (const name of ['template.yaml', 'template.yml', 'template.json']) {
      if (cfnFiles.includes(name)) continue;
      const content = await ctx.readFile(name);
      if (content && content.includes('AWSTemplateFormatVersion')) {
        cfnFiles.push(name);
      }
    }
    if (cfnFiles.length > 0) {
      tools.push({
        tool: 'cloudformation',
        files: cfnFiles,
        providers: ['aws'],
      });
    }

    // ── Ansible ──
    const ansibleFiles = await ctx.findFiles([
      '**/playbook*.yml',
      '**/playbook*.yaml',
      '**/ansible.cfg',
      '**/site.yml',
      '**/site.yaml',
    ]);
    if (ansibleFiles.length > 0) {
      tools.push({tool: 'ansible', files: ansibleFiles});
    }

    // ── Helm ──
    const helmFiles = await ctx.findFiles(['**/Chart.yaml', '**/Chart.yml']);
    if (helmFiles.length > 0) {
      tools.push({tool: 'helm', files: helmFiles});
    }

    return {tools};
  },
};
