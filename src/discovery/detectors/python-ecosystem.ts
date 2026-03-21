import type {Detector, DetectorContext} from '../types.js';
import type {PythonEcosystemInfo} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known Python web / async frameworks. */
const PYTHON_FRAMEWORKS: Record<string, string> = {
  django: 'django',
  flask: 'flask',
  fastapi: 'fastapi',
  starlette: 'starlette',
  tornado: 'tornado',
  sanic: 'sanic',
  aiohttp: 'aiohttp',
  bottle: 'bottle',
  pyramid: 'pyramid',
  falcon: 'falcon',
  quart: 'quart',
  litestar: 'litestar',
  'django-rest-framework': 'drf',
  djangorestframework: 'drf',
  celery: 'celery',
  sqlalchemy: 'sqlalchemy',
  'tortoise-orm': 'tortoise-orm',
  pytest: 'pytest',
  unittest: 'unittest',
};

/** Security-related Python dependencies. */
const SECURITY_DEPS: Record<string, string> = {
  bandit: 'bandit',
  safety: 'safety',
  'pip-audit': 'pip-audit',
  cryptography: 'cryptography',
  pyjwt: 'pyjwt',
  'python-jose': 'python-jose',
  paramiko: 'paramiko',
  bcrypt: 'bcrypt',
  passlib: 'passlib',
  'django-security': 'django-security',
  'flask-talisman': 'flask-talisman',
  'flask-login': 'flask-login',
  'django-allauth': 'django-allauth',
  'django-cors-headers': 'django-cors-headers',
  'python-dotenv': 'python-dotenv',
  certifi: 'certifi',
};

/** Virtual-environment directory names. */
const VENV_DIRS = ['venv', '.venv', 'env', '.env', 'virtualenv'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PyprojectToml {
  project?: {
    'requires-python'?: string;
    dependencies?: string[];
  };
  tool?: {
    poetry?: {
      dependencies?: Record<string, unknown>;
      'dev-dependencies'?: Record<string, unknown>;
      group?: Record<string, {dependencies?: Record<string, unknown>}>;
    };
    pdm?: {
      'dev-dependencies'?: Record<string, string[]>;
    };
  };
  'build-system'?: {
    requires?: string[];
    'build-backend'?: string;
  };
}

/** Extracts dependency names from a pyproject.toml structure. */
function extractPyprojectDeps(toml: PyprojectToml): string[] {
  const deps: string[] = [];

  // PEP 621 project.dependencies
  if (toml.project?.dependencies) {
    for (const dep of toml.project.dependencies) {
      const name = dep.split(/[=<>!~;\s[]/)[0].toLowerCase();
      if (name) deps.push(name);
    }
  }

  // Poetry dependencies
  const poetryDeps = toml.tool?.poetry?.dependencies;
  if (poetryDeps) {
    for (const dep of Object.keys(poetryDeps)) {
      if (dep !== 'python') deps.push(dep.toLowerCase());
    }
  }
  const poetryDevDeps = toml.tool?.poetry?.['dev-dependencies'];
  if (poetryDevDeps) {
    for (const dep of Object.keys(poetryDevDeps)) {
      deps.push(dep.toLowerCase());
    }
  }
  // Poetry groups
  const groups = toml.tool?.poetry?.group;
  if (groups) {
    for (const group of Object.values(groups)) {
      if (group.dependencies) {
        for (const dep of Object.keys(group.dependencies)) {
          deps.push(dep.toLowerCase());
        }
      }
    }
  }

  return deps;
}

/** Extracts dependency names from a requirements-style text. */
function extractRequirementsDeps(content: string): string[] {
  const deps: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = trimmed.split(/[=<>!~;\s[]/)[0].toLowerCase();
    if (name) deps.push(name);
  }
  return deps;
}

/** Determines the package manager from available files. */
function detectPackageManager(
  hasPyprojectToml: boolean,
  hasPoetryLock: boolean,
  hasPipfileLock: boolean,
  hasUvLock: boolean,
  buildBackend?: string,
  hasPipfile?: boolean,
  hasRequirements?: boolean,
): 'pip' | 'poetry' | 'pipenv' | 'pdm' | 'uv' | null {
  if (hasUvLock) return 'uv';
  if (hasPoetryLock) return 'poetry';
  if (hasPipfileLock || hasPipfile) return 'pipenv';
  if (hasPyprojectToml && buildBackend?.includes('pdm')) return 'pdm';
  if (hasPyprojectToml && buildBackend?.includes('poetry')) return 'poetry';
  if (hasRequirements || hasPyprojectToml) return 'pip';
  return null;
}

// ---------------------------------------------------------------------------
// Minimal TOML parsers (sufficient for pyproject.toml fields we care about)
// ---------------------------------------------------------------------------

/**
 * Parses a pyproject.toml file with basic TOML understanding.
 * Not a full TOML parser — handles the subset needed for dependency extraction.
 */
function parsePyprojectToml(content: string): PyprojectToml {
  const result: PyprojectToml = {};
  const lines = content.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Section header: [tool.poetry.dependencies]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Key-value pairs
    const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    // Handle multi-line arrays
    if (value === '[') {
      const items: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const arrayLine = lines[j].trim();
        if (arrayLine === ']') {
          i = j;
          break;
        }
        const item = arrayLine.replace(/[",]/g, '').trim();
        if (item && !item.startsWith('#')) items.push(item);
      }
      assignTomlValue(result, currentSection, key, items);
    } else {
      // Single-line value
      const parsed = parseTomlValue(value);
      assignTomlValue(result, currentSection, key, parsed);
    }
  }

  return result;
}

function parseTomlValue(value: string): string | string[] {
  // Inline array: ["dep1", "dep2"]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(s => s.replace(/['"]/g, '').trim())
      .filter(Boolean);
  }
  // Quoted string
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function assignTomlValue(
  result: PyprojectToml,
  section: string,
  key: string,
  value: string | string[],
): void {
  if (section === 'project' && key === 'requires-python') {
    result.project = result.project ?? {};
    result.project['requires-python'] = value as string;
  }
  if (section === 'project' && key === 'dependencies') {
    result.project = result.project ?? {};
    result.project.dependencies = Array.isArray(value) ? value : [value];
  }
  if (section === 'build-system' && key === 'build-backend') {
    result['build-system'] = result['build-system'] ?? {};
    result['build-system']['build-backend'] = value as string;
  }
  if (section === 'tool.poetry.dependencies') {
    result.tool = result.tool ?? {};
    result.tool.poetry = result.tool.poetry ?? {};
    result.tool.poetry.dependencies = result.tool.poetry.dependencies ?? {};
    result.tool.poetry.dependencies[key] = value;
  }
  if (section === 'tool.poetry.dev-dependencies') {
    result.tool = result.tool ?? {};
    result.tool.poetry = result.tool.poetry ?? {};
    result.tool.poetry['dev-dependencies'] =
      result.tool.poetry['dev-dependencies'] ?? {};
    result.tool.poetry['dev-dependencies'][key] = value;
  }
}

/** Parses dependency names from a Pipfile's [packages] and [dev-packages] sections. */
function parsePipfileDeps(content: string): string[] {
  const deps: string[] = [];
  const lines = content.split('\n');
  let inDepsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[(packages|dev-packages)\]$/.test(trimmed)) {
      inDepsSection = true;
      continue;
    }
    if (trimmed.startsWith('[')) {
      inDepsSection = false;
      continue;
    }
    if (inDepsSection && trimmed && !trimmed.startsWith('#')) {
      const name = trimmed.split(/\s*=/)[0].trim().toLowerCase();
      if (name) deps.push(name);
    }
  }
  return deps;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const pythonEcosystemDetector: Detector<PythonEcosystemInfo> = {
  name: 'python-ecosystem',

  async detect(ctx: DetectorContext): Promise<PythonEcosystemInfo> {
    // Check for primary project files
    const hasPyprojectToml = await ctx.fileExists('pyproject.toml');
    const hasSetupPy = await ctx.fileExists('setup.py');
    const hasSetupCfg = await ctx.fileExists('setup.cfg');
    const hasPipfile = await ctx.fileExists('Pipfile');
    const hasRequirementsTxt = await ctx.fileExists('requirements.txt');
    const hasPythonVersion = await ctx.fileExists('.python-version');
    const hasPoetryLock = await ctx.fileExists('poetry.lock');
    const hasPipfileLock = await ctx.fileExists('Pipfile.lock');
    const hasUvLock = await ctx.fileExists('uv.lock');

    const detected =
      hasPyprojectToml ||
      hasSetupPy ||
      hasSetupCfg ||
      hasPipfile ||
      hasRequirementsTxt;

    if (!detected) {
      return {
        detected: false,
        packageManager: null,
        hasVirtualEnv: false,
        virtualEnvPaths: [],
        hasPyprojectToml: false,
        hasPoetryLock: false,
        hasPipfileLock: false,
        frameworks: [],
        securityDeps: [],
      };
    }

    // Collect all dependencies
    const allDeps: string[] = [];
    let buildBackend: string | undefined;
    let pythonVersion: string | undefined;

    // Parse pyproject.toml
    if (hasPyprojectToml) {
      const content = await ctx.readFile('pyproject.toml');
      if (content) {
        const toml = parsePyprojectToml(content);
        allDeps.push(...extractPyprojectDeps(toml));
        buildBackend = toml['build-system']?.['build-backend'];
        if (toml.project?.['requires-python']) {
          pythonVersion = toml.project['requires-python'];
        }
      }
    }

    // Parse requirements.txt
    if (hasRequirementsTxt) {
      const content = await ctx.readFile('requirements.txt');
      if (content) {
        allDeps.push(...extractRequirementsDeps(content));
      }
    }

    // Parse Pipfile
    if (hasPipfile) {
      const content = await ctx.readFile('Pipfile');
      if (content) {
        allDeps.push(...parsePipfileDeps(content));
      }
    }

    // Read .python-version
    if (hasPythonVersion && !pythonVersion) {
      const content = await ctx.readFile('.python-version');
      if (content) {
        pythonVersion = content.trim().split('\n')[0].trim();
      }
    }

    // Check for virtual environment directories
    const virtualEnvPaths: string[] = [];
    for (const dir of VENV_DIRS) {
      const pyBin = await ctx.fileExists(`${dir}/bin/python`);
      const pyScripts = await ctx.fileExists(`${dir}/Scripts/python.exe`);
      const pyvenvCfg = await ctx.fileExists(`${dir}/pyvenv.cfg`);
      if (pyBin || pyScripts || pyvenvCfg) {
        virtualEnvPaths.push(dir);
      }
    }

    // Determine project file
    let projectFile: string | undefined;
    if (hasPyprojectToml) projectFile = 'pyproject.toml';
    else if (hasSetupPy) projectFile = 'setup.py';
    else if (hasPipfile) projectFile = 'Pipfile';
    else if (hasRequirementsTxt) projectFile = 'requirements.txt';

    // Detect frameworks and security deps
    const depSet = new Set(allDeps);
    const frameworks: string[] = [];
    for (const [dep, framework] of Object.entries(PYTHON_FRAMEWORKS)) {
      if (depSet.has(dep)) {
        frameworks.push(framework);
      }
    }

    const securityDeps: string[] = [];
    for (const [dep, name] of Object.entries(SECURITY_DEPS)) {
      if (depSet.has(dep)) {
        securityDeps.push(name);
      }
    }

    const packageManager = detectPackageManager(
      hasPyprojectToml,
      hasPoetryLock,
      hasPipfileLock,
      hasUvLock,
      buildBackend,
      hasPipfile,
      hasRequirementsTxt,
    );

    return {
      detected,
      packageManager,
      projectFile,
      hasVirtualEnv: virtualEnvPaths.length > 0,
      virtualEnvPaths,
      hasPyprojectToml,
      hasPoetryLock,
      hasPipfileLock,
      pythonVersion,
      frameworks,
      securityDeps,
    };
  },
};
