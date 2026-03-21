import type {Detector, DetectorContext, CIInfo, CIWorkflow, CISecurityCheck} from '../types.js';

interface CIPlatformSignature {
  name: string;
  configPatterns: string[];
}

const CI_PLATFORMS: CIPlatformSignature[] = [
  {name: 'github-actions', configPatterns: ['.github/workflows/*.yml', '.github/workflows/*.yaml']},
  {name: 'gitlab-ci', configPatterns: ['.gitlab-ci.yml', '.gitlab-ci.yaml']},
  {name: 'jenkins', configPatterns: ['Jenkinsfile', 'Jenkinsfile.*']},
  {name: 'circleci', configPatterns: ['.circleci/config.yml']},
  {name: 'travis-ci', configPatterns: ['.travis.yml']},
  {name: 'bitbucket-pipelines', configPatterns: ['bitbucket-pipelines.yml']},
  {name: 'azure-devops', configPatterns: ['azure-pipelines.yml', '.azure-pipelines/*.yml']},
  {name: 'drone', configPatterns: ['.drone.yml']},
  {name: 'buildkite', configPatterns: ['.buildkite/pipeline.yml', '.buildkite/pipeline.yaml']},
  {name: 'woodpecker', configPatterns: ['.woodpecker.yml', '.woodpecker/*.yml']},
];

/** Security tools/actions we look for inside CI configs. */
const SECURITY_CHECK_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  type: CISecurityCheck['type'];
}> = [
  {pattern: /codeql|CodeQL/i, name: 'CodeQL', type: 'sast'},
  {pattern: /semgrep/i, name: 'Semgrep', type: 'sast'},
  {pattern: /sonar(?:qube|cloud|scanner)/i, name: 'SonarQube', type: 'sast'},
  {pattern: /snyk/i, name: 'Snyk', type: 'sca'},
  {pattern: /trivy/i, name: 'Trivy', type: 'container'},
  {pattern: /grype/i, name: 'Grype', type: 'container'},
  {pattern: /docker\s*scout/i, name: 'Docker Scout', type: 'container'},
  {pattern: /npm\s+audit|yarn\s+audit/i, name: 'npm/yarn audit', type: 'sca'},
  {pattern: /dependency[- ]?check/i, name: 'OWASP Dependency-Check', type: 'sca'},
  {pattern: /gitleaks|trufflehog|detect-secrets/i, name: 'Secret Scanner', type: 'secrets'},
  {pattern: /zap|zaproxy|owasp.*zap/i, name: 'OWASP ZAP', type: 'dast'},
  {pattern: /nuclei/i, name: 'Nuclei', type: 'dast'},
  {pattern: /eslint-plugin-security/i, name: 'ESLint Security', type: 'sast'},
  {pattern: /safety\s+check|pip-audit/i, name: 'Python Safety', type: 'sca'},
  {pattern: /gosec/i, name: 'Gosec', type: 'sast'},
  {pattern: /cargo[- ]audit/i, name: 'Cargo Audit', type: 'sca'},
  {pattern: /bandit/i, name: 'Bandit', type: 'sast'},
  {pattern: /dependabot/i, name: 'Dependabot', type: 'sca'},
  {pattern: /renovate/i, name: 'Renovate', type: 'sca'},
];

export const ciDetector: Detector<CIInfo> = {
  name: 'ci',

  async detect(ctx: DetectorContext): Promise<CIInfo> {
    let platform = 'none';
    const workflows: CIWorkflow[] = [];
    const securityChecks: CISecurityCheck[] = [];
    const seenChecks = new Set<string>();

    for (const ci of CI_PLATFORMS) {
      const configFiles = await ctx.findFiles(ci.configPatterns);
      if (configFiles.length === 0) continue;

      platform = ci.name;

      for (const configFile of configFiles) {
        const content = await ctx.readFile(configFile);
        if (!content) continue;

        // Extract workflow name (best-effort from YAML)
        const nameMatch = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
        const wfName = nameMatch?.[1] ?? configFile;

        // Extract triggers
        const triggers: string[] = [];
        const onMatch = content.match(/^on:\s*\n((?:\s+.+\n)*)/m);
        if (onMatch) {
          const triggerBlock = onMatch[1];
          const triggerLines = triggerBlock.match(/^\s+(\w[\w-]*)\s*:/gm);
          if (triggerLines) {
            for (const t of triggerLines) {
              triggers.push(t.trim().replace(/:$/, ''));
            }
          }
        }
        // Single-line on: [push, pull_request]
        const onLineMatch = content.match(/^on:\s*\[([^\]]+)\]/m);
        if (onLineMatch) {
          triggers.push(...onLineMatch[1].split(',').map(t => t.trim()));
        }
        // Simple on: push
        const onSimpleMatch = content.match(/^on:\s+(\w+)\s*$/m);
        if (onSimpleMatch) {
          triggers.push(onSimpleMatch[1]);
        }

        workflows.push({name: wfName, file: configFile, triggers});

        // Detect security checks within this workflow
        for (const check of SECURITY_CHECK_PATTERNS) {
          if (check.pattern.test(content) && !seenChecks.has(check.name)) {
            seenChecks.add(check.name);
            securityChecks.push({
              name: check.name,
              type: check.type,
              workflow: configFile,
            });
          }
        }
      }

      // Also check for Dependabot config
      if (ci.name === 'github-actions') {
        if (await ctx.fileExists('.github/dependabot.yml') ||
            await ctx.fileExists('.github/dependabot.yaml')) {
          if (!seenChecks.has('Dependabot')) {
            seenChecks.add('Dependabot');
            securityChecks.push({
              name: 'Dependabot',
              type: 'sca',
              workflow: '.github/dependabot.yml',
            });
          }
        }
      }

      break; // Only report the first CI platform found
    }

    return {platform, workflows, securityChecks};
  },
};
