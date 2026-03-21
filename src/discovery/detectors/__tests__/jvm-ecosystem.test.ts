import {describe, it, expect} from 'vitest';
import {jvmEcosystemDetector} from '../jvm-ecosystem.js';
import {createMockContext} from './helpers.js';

describe('jvmEcosystemDetector', () => {
  it('returns detected=false when no JVM build files exist', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.buildTool).toBeNull();
    expect(result.hasSpringBoot).toBe(false);
    expect(result.frameworks).toEqual([]);
    expect(result.securityDeps).toEqual([]);
  });

  it('detects Maven project from pom.xml', async () => {
    const ctx = createMockContext({
      'pom.xml': [
        '<?xml version="1.0"?>',
        '<project>',
        '  <modelVersion>4.0.0</modelVersion>',
        '  <groupId>com.example</groupId>',
        '  <artifactId>myapp</artifactId>',
        '  <properties>',
        '    <java.version>17</java.version>',
        '  </properties>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-web</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>org.springframework.boot</groupId>',
        '      <artifactId>spring-boot-starter-security</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n'),
      '.mvn/wrapper/maven-wrapper.properties': 'distributionUrl=...',
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.buildTool).toBe('maven');
    expect(result.buildFile).toBe('pom.xml');
    expect(result.javaVersion).toBe('17');
    expect(result.hasSpringBoot).toBe(true);
    expect(result.hasSpringSecurity).toBe(true);
    expect(result.hasMavenWrapper).toBe(true);
    expect(result.frameworks).toContain('spring-boot');
    expect(result.securityDeps).toContain('spring-security');
  });

  it('detects Gradle project from build.gradle', async () => {
    const ctx = createMockContext({
      'build.gradle': [
        'plugins {',
        "    id 'java'",
        "    id 'org.springframework.boot' version '3.2.0'",
        '}',
        '',
        'sourceCompatibility = 17',
        '',
        'dependencies {',
        "    implementation 'org.springframework.boot:spring-boot-starter-web'",
        "    implementation 'io.jsonwebtoken:jjwt-api:0.12.3'",
        "    testImplementation 'org.mockito:mockito-core:5.8.0'",
        '}',
      ].join('\n'),
      'gradlew': '#!/bin/sh\n# Gradle wrapper',
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.buildTool).toBe('gradle');
    expect(result.buildFile).toBe('build.gradle');
    expect(result.javaVersion).toBe('17');
    expect(result.hasSpringBoot).toBe(true);
    expect(result.hasGradleWrapper).toBe(true);
    expect(result.frameworks).toContain('spring-boot');
    expect(result.frameworks).toContain('mockito');
    expect(result.securityDeps).toContain('jjwt');
  });

  it('detects Gradle Kotlin DSL (build.gradle.kts)', async () => {
    const ctx = createMockContext({
      'build.gradle.kts': [
        'plugins {',
        '    kotlin("jvm") version "1.9.21"',
        '    id("io.ktor.plugin") version "2.3.7"',
        '}',
        '',
        'dependencies {',
        '    implementation("io.ktor:ktor-server-core")',
        '    implementation("io.ktor:ktor-server-netty")',
        "    implementation(\"org.jetbrains.exposed:exposed-core:0.45.0\")",
        '}',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.buildTool).toBe('gradle');
    expect(result.buildFile).toBe('build.gradle.kts');
    expect(result.frameworks).toContain('kotlin');
    expect(result.frameworks).toContain('ktor');
    expect(result.frameworks).toContain('exposed');
  });

  it('detects SBT project from build.sbt', async () => {
    const ctx = createMockContext({
      'build.sbt': [
        'name := "my-scala-app"',
        'scalaVersion := "3.3.1"',
        '',
        'libraryDependencies ++= Seq(',
        '  "com.typesafe.akka" %% "akka-http" % "10.5.3",',
        '  "com.typesafe.akka" %% "akka-actor" % "2.8.5"',
        ')',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.buildTool).toBe('sbt');
    expect(result.buildFile).toBe('build.sbt');
    expect(result.frameworks).toContain('akka');
  });

  it('detects Gradle lockfile', async () => {
    const ctx = createMockContext({
      'build.gradle': 'plugins { id "java" }\n',
      'gradle.lockfile': '# lock file contents',
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.hasGradleLock).toBe(true);
  });

  it('detects security dependencies', async () => {
    const ctx = createMockContext({
      'pom.xml': [
        '<project>',
        '  <dependencies>',
        '    <dependency>',
        '      <groupId>org.keycloak</groupId>',
        '      <artifactId>keycloak-spring-boot-starter</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>com.github.spotbugs</groupId>',
        '      <artifactId>spotbugs-maven-plugin</artifactId>',
        '    </dependency>',
        '    <dependency>',
        '      <groupId>org.jacoco</groupId>',
        '      <artifactId>jacoco-maven-plugin</artifactId>',
        '    </dependency>',
        '  </dependencies>',
        '</project>',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.securityDeps).toContain('keycloak');
    expect(result.securityDeps).toContain('spotbugs');
    expect(result.securityDeps).toContain('jacoco');
  });

  it('extracts Java version from maven.compiler.source', async () => {
    const ctx = createMockContext({
      'pom.xml': [
        '<project>',
        '  <properties>',
        '    <maven.compiler.source>21</maven.compiler.source>',
        '    <maven.compiler.target>21</maven.compiler.target>',
        '  </properties>',
        '</project>',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.javaVersion).toBe('21');
  });

  it('extracts Java version from Gradle toolchain', async () => {
    const ctx = createMockContext({
      'build.gradle': [
        'java {',
        '    toolchain {',
        '        languageVersion.set(JavaLanguageVersion.of(21))',
        '    }',
        '}',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.javaVersion).toBe('21');
  });

  it('prefers pom.xml over build.gradle when both exist', async () => {
    const ctx = createMockContext({
      'pom.xml': '<project><properties><java.version>17</java.version></properties></project>',
      'build.gradle': 'sourceCompatibility = 11\n',
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.buildTool).toBe('maven');
    expect(result.buildFile).toBe('pom.xml');
    expect(result.javaVersion).toBe('17');
  });

  it('detects Micronaut framework', async () => {
    const ctx = createMockContext({
      'build.gradle': [
        'plugins {',
        '    id("io.micronaut.application") version "4.2.1"',
        '}',
        'dependencies {',
        '    implementation("io.micronaut:micronaut-http-server-netty")',
        '}',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.frameworks).toContain('micronaut');
  });

  it('detects Quarkus framework', async () => {
    const ctx = createMockContext({
      'pom.xml': [
        '<project>',
        '  <dependencyManagement>',
        '    <dependencies>',
        '      <dependency>',
        '        <groupId>io.quarkus.platform</groupId>',
        '        <artifactId>quarkus-bom</artifactId>',
        '      </dependency>',
        '    </dependencies>',
        '  </dependencyManagement>',
        '</project>',
      ].join('\n'),
    });

    const result = await jvmEcosystemDetector.detect(ctx);

    expect(result.frameworks).toContain('quarkus');
  });

  it('has correct detector name', () => {
    expect(jvmEcosystemDetector.name).toBe('jvm-ecosystem');
  });
});
