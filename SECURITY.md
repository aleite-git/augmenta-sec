# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

Only the latest minor release receives security patches. We recommend always running the most recent version.

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in AugmentaSec, please report it responsibly:

1. **Email**: Send details to **security@augmenta-sec.dev**
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. **Encryption**: If you need to share sensitive details, request our PGP key in your initial email.

## Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledge receipt | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix for critical severity | Within 30 days |
| Fix for high severity | Within 60 days |
| Fix for medium/low severity | Next scheduled release |

## What to Expect

After you submit a report:

1. **Acknowledgement** -- We will confirm receipt within 48 hours and assign a tracking identifier.
2. **Assessment** -- We will evaluate the severity and exploitability of the reported issue.
3. **Communication** -- We will keep you informed of our progress toward a fix.
4. **Fix and Disclosure** -- Once patched, we will coordinate disclosure timing with you. We aim to publish a fix before any public disclosure.
5. **Credit** -- With your permission, we will credit you in the release notes and CHANGELOG.

## Responsible Disclosure

We follow a coordinated disclosure process:

- We ask that you give us reasonable time to address the issue before any public disclosure.
- We will not take legal action against researchers who report vulnerabilities responsibly and in good faith.
- We will work with you to understand and validate the issue.
- If you are unsure whether something qualifies as a vulnerability, please report it anyway -- we would rather investigate a false alarm than miss a real issue.

## Scope

The following are in scope:

- The AugmentaSec CLI tool and its dependencies
- The discovery engine and all 18 detectors
- LLM provider integrations (credential handling, prompt injection risks)
- Git platform integrations (token handling, API interactions)
- Scanner orchestration (command injection, output parsing)
- Configuration loading and validation
- The server mode HTTP API (authentication, rate limiting, input validation)
- Webhook processing (payload validation, replay attacks)
- Report generation (XSS in HTML reports, path traversal)

The following are out of scope:

- Vulnerabilities in third-party scanners themselves (Semgrep, Trivy, etc.)
- Vulnerabilities in LLM provider APIs
- Vulnerabilities in Git platform APIs
- Social engineering attacks

## Bug Bounty

We do not currently operate a bug bounty program. We appreciate and acknowledge all valid security reports regardless.

## Security Best Practices for Users

- Store API keys in environment variables, not in configuration files.
- Add `.augmenta-sec/config.yaml` to `.gitignore` if it contains sensitive values.
- Review the `autonomy` settings carefully before enabling automated actions.
- Use `never_auto_merge: true` (the default) to ensure human review of auto-generated PRs.
- When using Ollama for local inference, ensure the Ollama server is not exposed to untrusted networks.
