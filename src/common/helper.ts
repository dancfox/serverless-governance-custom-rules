import { ComplianceType, Evaluation } from '@aws-sdk/client-config-service';
import { ConfigChangeEvent, ConfigOversizedChangeEvent, ConfigPeriodicFrequencyEvent, ConfigMessageType, ConfigInvokingEvent, ConfigServiceEvent, ConfigParameters } from './aws-config-types';

/**
 * 
 * @param event 
 * @returns 
 */
const isChangeEvent = (event: ConfigInvokingEvent): event is ConfigChangeEvent =>
  (event as ConfigChangeEvent).messageType === ConfigMessageType.ITEM_CHANGE;

/**
 * 
 * @param event 
 * @returns 
 */
const isOversizedChangeEvent = (event: ConfigInvokingEvent): event is ConfigOversizedChangeEvent =>
  (event as ConfigOversizedChangeEvent).messageType === ConfigMessageType.OVERSIZED_ITEM_CHANGE;

/**
 * 
 * @param event 
 * @returns 
 */
const isPeriodicEvent = (event: ConfigInvokingEvent): event is ConfigPeriodicFrequencyEvent =>
  (event as ConfigPeriodicFrequencyEvent).messageType === ConfigMessageType.SCHEDULED_NOTIFICATION;

/**
 * 
 * @param resourceType 
 * @param resourceId 
 * @param compliance 
 * @param timestamp 
 * @returns 
 */
const createEvaluation = (resourceType: string, resourceId: string, compliance: ComplianceType, timestamp: Date): Evaluation =>
  ({
    ComplianceResourceType: resourceType,
    ComplianceResourceId: resourceId,
    ComplianceType: compliance,
    OrderingTimestamp: timestamp
  });

/**
 * 
 * @param event 
 * @returns 
 */
const parseConfigServiceEvent = (event: ConfigServiceEvent): { invokingEvent: ConfigInvokingEvent; ruleParameters: ConfigParameters } => 
  ({
    invokingEvent: JSON.parse(event.invokingEvent),
    ruleParameters: JSON.parse(event.ruleParameters)
  });

export {
  isChangeEvent,
  isOversizedChangeEvent,
  isPeriodicEvent,
  createEvaluation,
  parseConfigServiceEvent
};