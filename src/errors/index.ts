export {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  FileSystemError,
  ProviderError,
  UserInputError,
} from './types.js';

export {formatError, isRecoverable, withGracefulDegradation} from './handler.js';
