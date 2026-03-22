export {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  FileSystemError,
  ProviderError,
  UserInputError,
} from './types.js';

export {formatError, isRecoverable, withGracefulDegradation} from './handler.js';

export type {UserError} from './user-errors.js';
export {formatUserError} from './user-errors.js';
