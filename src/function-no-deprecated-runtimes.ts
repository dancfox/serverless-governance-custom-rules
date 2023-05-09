import { Context } from 'aws-lambda';
import { ComplianceType, ConfigService, Evaluation, ListDiscoveredResourcesCommand, PutEvaluationsRequest, ResourceIdentifier, ResourceType } from '@aws-sdk/client-config-service';
import { GetFunctionConfigurationCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ConfigServiceEvent, ConfigChangeEvent, ConfigPeriodicFrequencyEvent, ConfigParameters, ConfigConfigurationItem, ConfigInvokingEvent } from './common/aws-config-types';
import { isChangeEvent, isOversizedChangeEvent, isPeriodicEvent, createEvaluation, parseConfigServiceEvent } from './common/helper';
import { logger } from './common/powertools';

// Config Service client
const configClient = new ConfigService({ region: process.env.AWS_REGION });
// Lambda service client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// List of deprecated runtimes from AWS Docs (https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html#runtime-support-policy)
// This should ideally be based on an API call to SSM Public Parameters or the Lambda service.
// Can also specify additional deprecated runtimes with rule parameter `otherDeprecatedRuntimes`
const DEPRECATED_RUNTIME_IDENTIFIERS = [
  'python3.6',
  'python2.7',
  'dotnetcore2.1',
  'ruby2.5',
  'nodejs10.x',
  'nodejs8.10',
  'nodejs4.3',
  'nodejs6.10',
  'dotnetcore1.0',
  'dotnetcore2.0',
  'nodejs4.3-edge',
  'nodejs'
];

// This function is the meat of our compliance check! This would be implemented in each rule built, much of the rest
// is boilerplate / util functions that could be moved elsewhere
const evaluateChangeEvent = async (invokingEvent: ConfigChangeEvent, _: ConfigParameters): Promise<Evaluation[] | void> => {
  const item: ConfigConfigurationItem = invokingEvent.configurationItem;
  if (item.resourceType !== 'AWS::Lambda::Function') {
    throw new Error('Invalid resource type');
  }

};

// This function is the meat of our compliance check! This would be implemented in each rule built, much of the rest
// is boilerplate / util functions that could be moved elsewhere
const evaluatePeriodicEvent = async (_: ConfigPeriodicFrequencyEvent, ruleParameters: ConfigParameters): Promise<Evaluation[]> => {
  // let nextToken = undefined;

  const functions = await findLambdaFunctions();
  if (!functions.resources) { throw new Error('No Lambda resources found'); }

  const deprecatedRuntimes = DEPRECATED_RUNTIME_IDENTIFIERS;

  if (ruleParameters['otherDeprecatedRuntimes']) {
    const otherDeprecatedRuntimes = ruleParameters['otherDeprecatedRuntimes'].split(/,\s*/);
    if (Array.isArray(otherDeprecatedRuntimes)) {
      deprecatedRuntimes.push(...otherDeprecatedRuntimes);
    } else {
      deprecatedRuntimes.push(otherDeprecatedRuntimes);
    }
  }

  logger.debug(`Deprecated runtimes: ${deprecatedRuntimes}`);

  const results: Evaluation[] = [];

  for (const func of functions.resources) {
    if (!func.resourceId) { continue; }
    logger.info(`Checking compliance of ${func.resourceName}`);
    const cmd = new GetFunctionConfigurationCommand({
      FunctionName: func.resourceName,
    });

    const result = await lambdaClient.send(cmd);
    if (!result.Runtime) { continue; }
        
    const compliance: ComplianceType =
      deprecatedRuntimes.indexOf(result.Runtime.toString()) < 0 ? ComplianceType.Compliant : ComplianceType.Non_Compliant;

    results.push(createEvaluation(
      ResourceType.Function,
      func.resourceId,
      compliance,
      new Date() // for periodic, use current timestamp
    ));
  }

  return results;
};

// TODO: move to util?
const evaluateCompliance = async (invokingEvent: ConfigInvokingEvent, ruleParameters: ConfigParameters): Promise<Evaluation[]> => {
  let results: Evaluation[] = [];

  if (isChangeEvent(invokingEvent)) {
    logger.debug('Change event found');
    await evaluateChangeEvent(invokingEvent, ruleParameters);
  } else if (isOversizedChangeEvent(invokingEvent)) {

  } else if (isPeriodicEvent(invokingEvent)) {
    logger.debug('Periodic event found');
    results = await evaluatePeriodicEvent(invokingEvent, ruleParameters);
  }

  return results;
};

/*** CONFIG API WRAPPERS ***/
/**
 * 
 * @param nextToken 
 * @returns 
 */
const findLambdaFunctions = async (nextToken?: string): Promise<{ resources: ResourceIdentifier[] | undefined; nextToken: string | undefined }> => {
  const cmd = new ListDiscoveredResourcesCommand({
    resourceType: ResourceType.Function
  });

  // TODO: keep going if nextToken is not null
  if (nextToken) { cmd.input.nextToken = nextToken; }

  const result = await configClient.send(cmd);

  return {
    resources: result.resourceIdentifiers,
    nextToken: result.nextToken
  };
};

/**
 * 
 * @param compliance 
 * @param resultToken 
 */
const putEvaluation = async (compliance: Evaluation[], resultToken: string): Promise<void> => {
  const params: PutEvaluationsRequest = {
    Evaluations: compliance,
    ResultToken: resultToken
  };

  await configClient.putEvaluations(params);
};

/**
 * 
 * @param event 
 * @param _ 
 */
export const handler = async(event: ConfigServiceEvent, _:Context): Promise<void> => {
  const { invokingEvent, ruleParameters } = parseConfigServiceEvent(event);

  const compliance = await evaluateCompliance(invokingEvent, ruleParameters);
  logger.debug(JSON.stringify(compliance));

  await putEvaluation(compliance, event.resultToken);
};