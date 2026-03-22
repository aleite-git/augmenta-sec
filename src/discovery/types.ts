/**
 * Discovery engine types — defines the security profile schema
 * and detector interfaces for AugmentaSec.
 */

// ---------------------------------------------------------------------------
// Detector infrastructure
// ---------------------------------------------------------------------------

export interface GrepOptions {
  maxFiles?: number;
  maxMatches?: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  match: string;
}

export interface DetectorContext {
  rootDir: string;
  findFiles(patterns: string[]): Promise<string[]>;
  readFile(relativePath: string): Promise<string | null>;
  readJson<T = unknown>(relativePath: string): Promise<T | null>;
  readYaml<T = unknown>(relativePath: string): Promise<T | null>;
  fileExists(relativePath: string): Promise<boolean>;
  grep(
    pattern: RegExp,
    filePatterns: string[],
    options?: GrepOptions,
  ): Promise<GrepMatch[]>;
}

export interface Detector<T> {
  name: string;
  detect(ctx: DetectorContext): Promise<T>;
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export interface LanguageEntry {
  name: string;
  percentage: number;
  fileCount: number;
}

export interface LanguageInfo {
  primary: string;
  all: LanguageEntry[];
}

// ---------------------------------------------------------------------------
// Frameworks
// ---------------------------------------------------------------------------

export interface FrameworkEntry {
  name: string;
  category: 'backend' | 'frontend' | 'fullstack' | 'orm' | 'testing';
  version?: string;
  confidence: number;
}

export interface FrameworkInfo {
  backend: FrameworkEntry[];
  frontend: FrameworkEntry[];
  fullstack: FrameworkEntry[];
  orm: FrameworkEntry[];
  testing: FrameworkEntry[];
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface AuthProvider {
  name: string;
  type: 'first-party' | 'third-party' | 'custom';
  confidence: number;
  source: string;
}

export interface AuthPattern {
  type:
    | 'middleware'
    | 'decorator'
    | 'guard'
    | 'token-verification'
    | 'session'
    | 'rbac';
  files: string[];
}

export interface AuthInfo {
  providers: AuthProvider[];
  patterns: AuthPattern[];
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface DatabaseEntry {
  type: string;
  driver?: string;
  orm?: string;
  migrationsDir?: string;
  schemaDir?: string;
  confidence: number;
}

export interface DatabaseInfo {
  databases: DatabaseEntry[];
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export interface EndpointSummary {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface ApiInfo {
  styles: string[];
  specFile?: string;
  routeCount: number;
  endpoints: EndpointSummary[];
}

// ---------------------------------------------------------------------------
// Security controls
// ---------------------------------------------------------------------------

export interface SecurityControl {
  name: string;
  type: string;
  present: boolean;
  confidence: number;
  source: string;
  details?: string;
}

export interface SecurityControlsInfo {
  present: SecurityControl[];
  missing: SecurityControl[];
}

// ---------------------------------------------------------------------------
// CI / CD
// ---------------------------------------------------------------------------

export interface CIWorkflow {
  name: string;
  file: string;
  triggers: string[];
}

export interface CISecurityCheck {
  name: string;
  type: 'sast' | 'dast' | 'sca' | 'container' | 'secrets';
  workflow: string;
}

export interface CIInfo {
  platform: string;
  workflows: CIWorkflow[];
  securityChecks: CISecurityCheck[];
}

// ---------------------------------------------------------------------------
// Documentation
// ---------------------------------------------------------------------------

export interface DocsInfo {
  hasReadme: boolean;
  hasContributing: boolean;
  hasSecurityPolicy: boolean;
  hasChangelog: boolean;
  hasLicense: boolean;
  architectureDocs: string[];
  aiConfigs: string[];
}

// ---------------------------------------------------------------------------
// Python ecosystem (ASEC-066)
// ---------------------------------------------------------------------------

export interface PythonEcosystemInfo {
  detected: boolean;
  packageManager: 'pip' | 'poetry' | 'pipenv' | 'pdm' | 'uv' | null;
  projectFile?: string;
  hasVirtualEnv: boolean;
  virtualEnvPaths: string[];
  hasPyprojectToml: boolean;
  hasPoetryLock: boolean;
  hasPipfileLock: boolean;
  pythonVersion?: string;
  frameworks: string[];
  securityDeps: string[];
}

// ---------------------------------------------------------------------------
// Go ecosystem (ASEC-067)
// ---------------------------------------------------------------------------

export interface GoEcosystemInfo {
  detected: boolean;
  goModFile?: string;
  goVersion?: string;
  modulePath?: string;
  hasGoSum: boolean;
  directDeps: number;
  indirectDeps: number;
  frameworks: string[];
  securityTools: string[];
  hasVendor: boolean;
  hasUnsafeImports: boolean;
}

// ---------------------------------------------------------------------------
// Rust ecosystem (ASEC-068)
// ---------------------------------------------------------------------------

export interface RustEcosystemInfo {
  detected: boolean;
  cargoTomlFile?: string;
  edition?: string;
  rustVersion?: string;
  hasCargoLock: boolean;
  crateCount: number;
  hasUnsafeBlocks: boolean;
  unsafeFileCount: number;
  frameworks: string[];
  securityDeps: string[];
  isWorkspace: boolean;
  workspaceMembers: string[];
}

// ---------------------------------------------------------------------------
// JVM ecosystem (ASEC-069)
// ---------------------------------------------------------------------------

export interface JvmEcosystemInfo {
  detected: boolean;
  buildTool: 'maven' | 'gradle' | 'sbt' | null;
  buildFile?: string;
  javaVersion?: string;
  hasSpringBoot: boolean;
  hasSpringSecurity: boolean;
  frameworks: string[];
  securityDeps: string[];
  hasGradleLock: boolean;
  hasMavenWrapper: boolean;
  hasGradleWrapper: boolean;
}

// ---------------------------------------------------------------------------
// Trust boundaries & PII (LLM-enhanced or manual)
// ---------------------------------------------------------------------------

export interface TrustBoundaryCandidate {
  name: string;
  type: 'field' | 'header' | 'cookie' | 'session';
  confidence: number;
  locations: string[];
  notes?: string;
}

export interface TrustBoundaryInfo {
  candidates: TrustBoundaryCandidate[];
}

export interface PiiFieldCandidate {
  field: string;
  location: string;
  classification:
    | 'direct-identifier'
    | 'quasi-identifier'
    | 'sensitive'
    | 'unknown';
  confidence: number;
}

export interface PiiInfo {
  candidates: PiiFieldCandidate[];
}

// ---------------------------------------------------------------------------
// Monorepo
// ---------------------------------------------------------------------------

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: 'package' | 'app' | 'library';
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  tool?: string;
  workspaces: WorkspaceEntry[];
}

// ---------------------------------------------------------------------------
// Git metadata
// ---------------------------------------------------------------------------

export interface GitMetadataInfo {
  hasGit: boolean;
  remoteUrl?: string;
  platform?:
    | 'github'
    | 'gitlab'
    | 'bitbucket'
    | 'azure-devops'
    | 'gitea'
    | 'unknown';
  defaultBranch?: string;
  owner?: string;
  repo?: string;
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------

export interface DockerInfo {
  hasDocker: boolean;
  dockerfiles: string[];
  hasCompose: boolean;
  composeFiles: string[];
  baseImages: string[];
  usesNonRoot: boolean;
  hasMultiStage: boolean;
  healthCheck: boolean;
}

// ---------------------------------------------------------------------------
// Infrastructure as Code
// ---------------------------------------------------------------------------

export interface IaCEntry {
  tool:
    | 'terraform'
    | 'pulumi'
    | 'cdk'
    | 'cloudformation'
    | 'ansible'
    | 'helm';
  files: string[];
  providers?: string[];
}

export interface IaCInfo {
  tools: IaCEntry[];
}

// ---------------------------------------------------------------------------
// Secret / env detection
// ---------------------------------------------------------------------------

export interface SecretFinding {
  type: 'env-file' | 'hardcoded' | 'config-reference';
  file: string;
  line?: number;
  pattern: string;
  risk: 'high' | 'medium' | 'low';
  /** Confidence score from 0.0 to 1.0 indicating likelihood of a true secret. */
  confidence?: number;
}

export interface SecretsInfo {
  envFiles: string[];
  gitignoresEnv: boolean;
  findings: SecretFinding[];
}

// ---------------------------------------------------------------------------
// License
// ---------------------------------------------------------------------------

export interface LicenseInfo {
  projectLicense?: string;
  licenseFile?: string;
  dependencyLicenses: DependencyLicense[];
}

export interface DependencyLicense {
  package: string;
  license: string;
  risk: 'none' | 'copyleft' | 'restrictive' | 'unknown';
}

// ---------------------------------------------------------------------------
// Top-level security profile
// ---------------------------------------------------------------------------

export interface SecurityProfile {
  version: string;
  generatedAt: string;
  target: string;
  project: {
    name: string;
    description?: string;
  };
  languages: LanguageInfo;
  frameworks: FrameworkInfo;
  auth: AuthInfo;
  database: DatabaseInfo;
  api: ApiInfo;
  securityControls: SecurityControlsInfo;
  ci: CIInfo;
  docs: DocsInfo;
  trustBoundaries: TrustBoundaryInfo;
  piiFields: PiiInfo;
  monorepo: MonorepoInfo;
  git: GitMetadataInfo;
  docker: DockerInfo;
  iac: IaCInfo;
  secrets: SecretsInfo;
  licenses: LicenseInfo;
  pythonEcosystem: PythonEcosystemInfo;
  goEcosystem: GoEcosystemInfo;
  rustEcosystem: RustEcosystemInfo;
  jvmEcosystem: JvmEcosystemInfo;
}
