/**
 * Versioned prompt library for reusable security analysis prompts.
 *
 * Provides template-based prompts with variable substitution for
 * common security analysis tasks (triage, threat modeling, etc.).
 */

/** A single prompt template with metadata. */
export interface Prompt {
  name: string;
  version: string;
  description: string;
  template: string;
  variables: string[];
}

/** Read-only library for retrieving and rendering prompts. */
export interface PromptLibrary {
  /** Retrieves a prompt definition by name, or undefined if not found. */
  get(name: string): Prompt | undefined;

  /** Renders a prompt template by substituting variables. */
  render(name: string, vars: Record<string, string>): string;

  /** Returns all registered prompt names. */
  list(): string[];
}

/** Built-in security analysis prompts. */
const BUILTIN_PROMPTS: Prompt[] = [
  {
    name: 'triage-finding',
    version: '1.0.0',
    description:
      'Quickly assess whether a static analysis finding is a true positive.',
    template: [
      'You are a security engineer triaging static analysis findings.',
      '',
      'Finding: {{finding}}',
      'File: {{file}}',
      'Language: {{language}}',
      '',
      'Classify this finding as TRUE_POSITIVE, FALSE_POSITIVE, or NEEDS_REVIEW.',
      'Provide a one-sentence rationale.',
    ].join('\n'),
    variables: ['finding', 'file', 'language'],
  },
  {
    name: 'analyze-endpoint',
    version: '1.0.0',
    description:
      'Deep security analysis of an API endpoint for common vulnerabilities.',
    template: [
      'You are a senior application security engineer.',
      '',
      'Analyze this API endpoint for security vulnerabilities:',
      '',
      'Endpoint: {{method}} {{path}}',
      'Handler code:',
      '```{{language}}',
      '{{code}}',
      '```',
      '',
      'Check for: authentication bypass, authorization flaws, injection,',
      'mass assignment, IDOR, rate limiting gaps, and input validation issues.',
      'Return findings as structured JSON.',
    ].join('\n'),
    variables: ['method', 'path', 'language', 'code'],
  },
  {
    name: 'generate-threat-model',
    version: '1.0.0',
    description:
      'Generate a STRIDE-based threat model for a system component.',
    template: [
      'You are a threat modeling expert using the STRIDE methodology.',
      '',
      'Component: {{component}}',
      'Description: {{description}}',
      'Data flows: {{dataFlows}}',
      '',
      'Generate a threat model covering:',
      '- Spoofing, Tampering, Repudiation, Information Disclosure,',
      '  Denial of Service, Elevation of Privilege',
      '- For each threat: description, severity (Critical/High/Medium/Low),',
      '  likelihood, and recommended mitigations.',
    ].join('\n'),
    variables: ['component', 'description', 'dataFlows'],
  },
  {
    name: 'assess-auth-flow',
    version: '1.0.0',
    description:
      'Evaluate an authentication or authorization flow for weaknesses.',
    template: [
      'You are an authentication and authorization security specialist.',
      '',
      'Auth flow: {{flowName}}',
      'Implementation:',
      '```{{language}}',
      '{{code}}',
      '```',
      '',
      'Assess this flow for:',
      '- Token handling (generation, storage, expiry, rotation)',
      '- Session management weaknesses',
      '- Privilege escalation paths',
      '- Missing or weak access controls',
      'Provide severity ratings and remediation steps.',
    ].join('\n'),
    variables: ['flowName', 'language', 'code'],
  },
  {
    name: 'explain-vulnerability',
    version: '1.0.0',
    description:
      'Produce a developer-friendly explanation of a vulnerability with fix guidance.',
    template: [
      'You are a security educator explaining vulnerabilities to developers.',
      '',
      'Vulnerability: {{vulnerability}}',
      'CWE: {{cwe}}',
      'Affected code:',
      '```{{language}}',
      '{{code}}',
      '```',
      '',
      'Explain:',
      '1. What the vulnerability is and why it matters',
      '2. How an attacker could exploit it',
      '3. The potential impact',
      '4. Keep the explanation concise and actionable.',
    ].join('\n'),
    variables: ['vulnerability', 'cwe', 'language', 'code'],
  },
  {
    name: 'suggest-fix',
    version: '1.0.0',
    description:
      'Generate a concrete code fix for an identified security vulnerability.',
    template: [
      'You are a security engineer writing patches for vulnerabilities.',
      '',
      'Vulnerability: {{vulnerability}}',
      'File: {{file}}',
      'Current code:',
      '```{{language}}',
      '{{code}}',
      '```',
      '',
      'Provide a fixed version of the code that remedies the vulnerability.',
      'Explain what was changed and why. Ensure the fix does not break',
      'existing functionality.',
    ].join('\n'),
    variables: ['vulnerability', 'file', 'language', 'code'],
  },
];

/**
 * Creates a prompt library pre-loaded with built-in security prompts.
 *
 * @returns A PromptLibrary instance with get/render/list methods.
 */
export function createPromptLibrary(): PromptLibrary {
  const prompts = new Map<string, Prompt>();
  for (const prompt of BUILTIN_PROMPTS) {
    prompts.set(prompt.name, prompt);
  }

  return {
    get(name: string): Prompt | undefined {
      return prompts.get(name);
    },

    render(name: string, vars: Record<string, string>): string {
      const prompt = prompts.get(name);
      if (!prompt) {
        throw new Error(`Prompt "${name}" not found in library`);
      }

      // Validate that all required variables are provided.
      const missing = prompt.variables.filter(
        (v) => vars[v] === undefined || vars[v] === null,
      );
      if (missing.length > 0) {
        throw new Error(
          `Missing variables for prompt "${name}": ${missing.join(', ')}`,
        );
      }

      let rendered = prompt.template;
      for (const [key, value] of Object.entries(vars)) {
        rendered = rendered.replaceAll(`{{${key}}}`, value);
      }
      return rendered;
    },

    list(): string[] {
      return [...prompts.keys()];
    },
  };
}
