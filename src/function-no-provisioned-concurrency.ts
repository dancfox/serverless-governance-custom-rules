/*
 * This Custom Lambda Config rule tests for the presence of 
 * Provisioned Concurrency Configs across all Lambda functions
 * in the region. The rule then deletes the each found Config. 
 * 
 * This function also contains logic to mark the resources as 
 * non-compliant for future remediation. Remove the delete
 * section of code to mark resources for future remediation.
 */


import { Context } from 'aws-lambda';
import { ComplianceType, ConfigService, Evaluation, ListDiscoveredResourcesCommand, PutEvaluationsRequest, ResourceIdentifier, ResourceType } from '@aws-sdk/client-config-service';
import { ListProvisionedConcurrencyConfigsCommand, DeleteProvisionedConcurrencyConfigCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ConfigServiceEvent, ConfigChangeEvent, ConfigPeriodicFrequencyEvent, ConfigParameters, ConfigConfigurationItem, ConfigInvokingEvent } from './common/aws-config-types';
import { isChangeEvent, isOversizedChangeEvent, isPeriodicEvent, createEvaluation, parseConfigServiceEvent } from './common/helper';
import { logger } from './common/powertools';

const configClient = new ConfigService({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

const evaluateChangeEvent = async (invokingEvent: ConfigChangeEvent, _: ConfigParameters): Promise<Evaluation[] | void> => {
  const item: ConfigConfigurationItem = invokingEvent.configurationItem;
  if (item.resourceType !== 'AWS::Lambda::Function') {
    throw new Error('Invalid resource type');
  }
};

const evaluatePeriodicEvent = async (_: ConfigPeriodicFrequencyEvent, ruleParameters: ConfigParameters): Promise<Evaluation[]> => {

  const functions = await findLambdaFunctions();
  if (!functions.resources) { throw new Error('No Lambda resources found'); }

  const results: Evaluation[] = [];

  for (const func of functions.resources) {
    if (!func.resourceId) { continue; }
    logger.info(`Checking compliance of ${func.resourceName}`);
    const cmd = new ListProvisionedConcurrencyConfigsCommand({
      FunctionName: func.resourceName,
      // Qualifier: // add a version or alias if desired
    });

    const result = await lambdaClient.send(cmd);
    
    let compliance: ComplianceType = ComplianceType.Not_Applicable;
    logger.info("PC Config: " + JSON.stringify(result.ProvisionedConcurrencyConfigs));

    let qualifier;
    let arnWithQualifier = "1";

    if (result.ProvisionedConcurrencyConfigs && result.ProvisionedConcurrencyConfigs.length > 0) {
        compliance = ComplianceType.Non_Compliant;
        logger.info(func.resourceName + " is non-compliant");
        if (result.ProvisionedConcurrencyConfigs[0].FunctionArn != undefined) {
            arnWithQualifier = result.ProvisionedConcurrencyConfigs[0].FunctionArn;
        }
        qualifier = arnWithQualifier.split(':').pop();

        // This block deletes the provisioned concurrency configurations.
        // Uncomment it to remove provisioned concurrency immediately 
        // as part of the rule.

        // BEGIN DELETE BLOCK //
        /*
        const delcmd = new DeleteProvisionedConcurrencyConfigCommand({
          FunctionName: func.resourceName,
          Qualifier: qualifier
        });
        const deleteResult = await lambdaClient.send(delcmd);

        // the resource is now compliant
        compliance = ComplianceType.Compliant;

        logger.info("Provisioned Concurrency has been removed from " + func.resourceName + ". This resource is now compliant.");
        */
        // END DELETE BLOCK // 

    } else {
        compliance = ComplianceType.Compliant;
        logger.info(func.resourceName + " is compliant");
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