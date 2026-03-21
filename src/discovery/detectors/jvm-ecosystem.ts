import type {Detector, DetectorContext} from '../types.js';
import type {JvmEcosystemInfo} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Well-known JVM frameworks detected via Maven groupId:artifactId
 * or Gradle dependency strings.
 */
const JVM_FRAMEWORKS: Record<string, string> = {
  'spring-boot': 'spring-boot',
  'spring-webmvc': 'spring-mvc',
  'spring-webflux': 'spring-webflux',
  'spring-data': 'spring-data',
  'spring-cloud': 'spring-cloud',
  micronaut: 'micronaut',
  quarkus: 'quarkus',
  'vert.x': 'vertx',
  vertx: 'vertx',
  akka: 'akka',
  play: 'play-framework',
  dropwizard: 'dropwizard',
  hibernate: 'hibernate',
  jooq: 'jooq',
  mybatis: 'mybatis',
  junit: 'junit',
  testng: 'testng',
  mockito: 'mockito',
  reactor: 'reactor',
  grpc: 'grpc-java',
  kotlin: 'kotlin',
  ktor: 'ktor',
  exposed: 'exposed',
};

/**
 * Security-related JVM dependencies
 * (substrings matched in dependency declarations).
 */
const SECURITY_DEPS: Record<string, string> = {
  'spring-security': 'spring-security',
  'spring-boot-starter-security': 'spring-security',
  keycloak: 'keycloak',
  shiro: 'apache-shiro',
  pac4j: 'pac4j',
  'nimbus-jose-jwt': 'nimbus-jose-jwt',
  'java-jwt': 'java-jwt',
  jjwt: 'jjwt',
  'bouncy-castle': 'bouncy-castle',
  bouncycastle: 'bouncy-castle',
  bcprov: 'bouncy-castle',
  'owasp-java-html-sanitizer': 'owasp-html-sanitizer',
  'dependency-check': 'owasp-dependency-check',
  spotbugs: 'spotbugs',
  pmd: 'pmd',
  checkstyle: 'checkstyle',
  jacoco: 'jacoco',
  snyk: 'snyk',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts Java/JVM version from a Maven pom.xml.
 * Looks for <java.version>, <maven.compiler.source>, or <release>.
 */
function extractMavenJavaVersion(content: string): string | undefined {
  const patterns = [
    /<java\.version>\s*([^<]+)\s*<\/java\.version>/,
    /<maven\.compiler\.source>\s*([^<]+)\s*<\/maven\.compiler\.source>/,
    /<maven\.compiler\.target>\s*([^<]+)\s*<\/maven\.compiler\.target>/,
    /<release>\s*(\d+)\s*<\/release>/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * Extracts Java version from a Gradle build file.
 * Looks for sourceCompatibility, targetCompatibility, jvmTarget, or toolchain.
 */
function extractGradleJavaVersion(content: string): string | undefined {
  const patterns = [
    /sourceCompatibility\s*=\s*['"]?([^'"\s]+)/,
    /targetCompatibility\s*=\s*['"]?([^'"\s]+)/,
    /jvmTarget\s*=\s*['"]([^'"]+)/,
    /JavaVersion\.VERSION_(\d+)/,
    /toolchain\s*\{[^}]*languageVersion\.set\s*\(\s*JavaLanguageVersion\.of\s*\(\s*(\d+)\s*\)/s,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * Checks whether build file content contains references to a given substring.
 * Used for framework and security dep detection.
 */
function contentContains(content: string, substring: string): boolean {
  return content.toLowerCase().includes(substring.toLowerCase());
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const jvmEcosystemDetector: Detector<JvmEcosystemInfo> = {
  name: 'jvm-ecosystem',

  async detect(ctx: DetectorContext): Promise<JvmEcosystemInfo> {
    // Probe for build files
    const hasPom = await ctx.fileExists('pom.xml');
    const hasBuildGradle = await ctx.fileExists('build.gradle');
    const hasBuildGradleKts = await ctx.fileExists('build.gradle.kts');
    const hasBuildSbt = await ctx.fileExists('build.sbt');

    const detected = hasPom || hasBuildGradle || hasBuildGradleKts || hasBuildSbt;

    if (!detected) {
      return {
        detected: false,
        buildTool: null,
        hasSpringBoot: false,
        hasSpringSecurity: false,
        frameworks: [],
        securityDeps: [],
        hasGradleLock: false,
        hasMavenWrapper: false,
        hasGradleWrapper: false,
      };
    }

    // Determine build tool and read primary build file
    let buildTool: 'maven' | 'gradle' | 'sbt' | null = null;
    let buildFile: string | undefined;
    let buildContent = '';

    if (hasPom) {
      buildTool = 'maven';
      buildFile = 'pom.xml';
      buildContent = (await ctx.readFile('pom.xml')) ?? '';
    } else if (hasBuildGradleKts) {
      buildTool = 'gradle';
      buildFile = 'build.gradle.kts';
      buildContent = (await ctx.readFile('build.gradle.kts')) ?? '';
    } else if (hasBuildGradle) {
      buildTool = 'gradle';
      buildFile = 'build.gradle';
      buildContent = (await ctx.readFile('build.gradle')) ?? '';
    } else if (hasBuildSbt) {
      buildTool = 'sbt';
      buildFile = 'build.sbt';
      buildContent = (await ctx.readFile('build.sbt')) ?? '';
    }

    // Also read settings.gradle if it exists (for additional dep info)
    const settingsContent =
      (await ctx.readFile('settings.gradle.kts')) ??
      (await ctx.readFile('settings.gradle')) ??
      '';
    const combinedContent = buildContent + '\n' + settingsContent;

    // Extract Java version
    let javaVersion: string | undefined;
    if (buildTool === 'maven') {
      javaVersion = extractMavenJavaVersion(buildContent);
    } else if (buildTool === 'gradle') {
      javaVersion = extractGradleJavaVersion(buildContent);
    }

    // Detect frameworks
    const frameworks: string[] = [];
    for (const [keyword, name] of Object.entries(JVM_FRAMEWORKS)) {
      if (contentContains(combinedContent, keyword)) {
        if (!frameworks.includes(name)) {
          frameworks.push(name);
        }
      }
    }

    // Detect security deps
    const securityDeps: string[] = [];
    for (const [keyword, name] of Object.entries(SECURITY_DEPS)) {
      if (contentContains(combinedContent, keyword)) {
        if (!securityDeps.includes(name)) {
          securityDeps.push(name);
        }
      }
    }

    // Spring-specific flags
    const hasSpringBoot = contentContains(combinedContent, 'spring-boot');
    const hasSpringSecurity =
      contentContains(combinedContent, 'spring-security') ||
      contentContains(combinedContent, 'spring-boot-starter-security');

    // Check for lock files and wrappers
    const hasGradleLock = await ctx.fileExists('gradle.lockfile');
    const hasMavenWrapper = await ctx.fileExists(
      '.mvn/wrapper/maven-wrapper.properties',
    );
    const hasGradleWrapper = await ctx.fileExists('gradlew');

    return {
      detected,
      buildTool,
      buildFile,
      javaVersion,
      hasSpringBoot,
      hasSpringSecurity,
      frameworks,
      securityDeps,
      hasGradleLock,
      hasMavenWrapper,
      hasGradleWrapper,
    };
  },
};
