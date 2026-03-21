import {writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import YAML from 'yaml';
import type {SecurityProfile} from './types.js';

/**
 * Writes the security profile to .augmenta-sec/profile.yaml
 * in the target repository.
 */
export async function writeProfile(
  profile: SecurityProfile,
  targetDir: string,
): Promise<string> {
  const outputDir = join(targetDir, '.augmenta-sec');
  await mkdir(outputDir, {recursive: true});

  const filePath = join(outputDir, 'profile.yaml');

  const header = [
    '# AugmentaSec Security Profile',
    `# Generated: ${profile.generatedAt}`,
    '#',
    '# Review and commit this file — it becomes your security baseline.',
    '# Sections marked [auto] were detected automatically.',
    '# Sections marked [review] should be verified by a human.',
    '# Sections marked [llm] can be enhanced with LLM analysis.',
    '#',
    '# Run `asec scan` to perform a full security analysis using this profile.',
    '',
  ].join('\n');

  // Remove verbose endpoint list from YAML output — keep it in a separate file
  const profileForYaml = {
    ...profile,
    api: {
      ...profile.api,
      endpoints: `${profile.api.endpoints.length} endpoints detected (see endpoints.yaml for full list)`,
    },
  };

  const yamlContent = YAML.stringify(profileForYaml, {
    indent: 2,
    lineWidth: 100,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });

  await writeFile(filePath, header + yamlContent, 'utf-8');

  // Write full endpoint list separately if there are any
  if (profile.api.endpoints.length > 0) {
    const endpointsPath = join(outputDir, 'endpoints.yaml');
    const endpointsYaml = YAML.stringify(
      {
        generatedAt: profile.generatedAt,
        routeCount: profile.api.routeCount,
        endpoints: profile.api.endpoints,
      },
      {indent: 2, lineWidth: 100},
    );
    await writeFile(
      endpointsPath,
      '# AugmentaSec — Detected API Endpoints\n' +
      '# Auto-generated. Do not edit manually.\n\n' +
      endpointsYaml,
      'utf-8',
    );
  }

  return filePath;
}
