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

  const results: Evaluation[] = [];
  const requiredLayers = ruleParameters['requiredLayerArns'].split(/,\s*/);

  for (const func of functions.resources) {
    if (!func.resourceId) { continue; }
    logger.info(`Checking compliance of ${func.resourceName}`);
    const cmd = new GetFunctionConfigurationCommand({
      FunctionName: func.resourceName,
      // Qualifier: // add a version or alias if desired
    });

    const result = await lambdaClient.send(cmd);
    
    let compliance: ComplianceType = ComplianceType.Not_Applicable;
    const funcLayersArns = (result.Layers || []).map(a => a.Arn);
    if (Array.isArray(requiredLayers)) {
      // collecting the ARNs of the layers attached to function
      const missing = requiredLayers.filter(l => !funcLayersArns.includes(l)); // finding intersection
      compliance = missing.length <= 0 ? ComplianceType.Compliant : ComplianceType.Non_Compliant;

      if (missing.length > 0) {
        logger.info(`Missing layers: ${missing}`);
      }
    } else { // requiredLayers is a string
      compliance = funcLayersArns.some(l => l === requiredLayers) ? ComplianceType.Compliant : ComplianceType.Non_Compliant;
    }

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