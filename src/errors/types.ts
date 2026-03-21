/**
 * Structured error hierarchy for AugmentaSec.
 *
 * Every error carries a machine-readable `code` and optional `context`
 * so callers can programmatically distinguish error categories without
 * string-matching on messages.
 */

/** Base error class with a machine-readable code and optional context. */
export class AugmentaSecError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AugmentaSecError';
    this.code = code;
    this.context = context;
  }
}

/** Thrown when an individual detector fails during discovery. */
export class DetectorError extends AugmentaSecError {
  readonly detectorName: string;

  constructor(detectorName: string, message: string, cause?: Error) {
    super(message, 'DETECTOR_ERROR', {detectorName});
    this.name = 'DetectorError';
    this.detectorName = detectorName;
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Thrown when an external provider (LLM, scanner, git platform) fails. */
export class ProviderError extends AugmentaSecError {
  readonly providerName: string;

  constructor(providerName: string, message: string, cause?: Error) {
    super(message, 'PROVIDER_ERROR', {providerName});
    this.name = 'ProviderError';
    this.providerName = providerName;
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Thrown when configuration is invalid or missing. */
export class ConfigError extends AugmentaSecError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

/** Thrown for file system access or I/O failures. */
export class FileSystemError extends AugmentaSecError {
  readonly path: string;

  constructor(path: string, message: string, cause?: Error) {
    super(message, 'FS_ERROR', {path});
    this.name = 'FileSystemError';
    this.path = path;
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Thrown when CLI / user input is invalid. */
export class UserInputError extends AugmentaSecError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'USER_INPUT_ERROR', context);
    this.name = 'UserInputError';
  }
}
