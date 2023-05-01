import { Logger } from '@aws-lambda-powertools/logger';

const defaults = {
  region: process.env.AWS_REGION || 'N/A',
  executionEnv: process.env.AWS_EXECUTION_ENV || 'N/A'
};

const logger = new Logger({
  persistentLogAttributes: {
    ...defaults
  }
});

export {
  logger
};
