import { ResourceType } from '@aws-sdk/client-config-service';
import { Handler } from 'aws-lambda';

/****
  Type to suppoert AWS Config custom rules

  @see https://docs.aws.amazon.com/lambda/latest/dg/services-config.html
  @see https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules_example-events.html
*/

export type ConfigHandler = Handler<ConfigServiceEvent, void>;

export interface ConfigServiceEvent {
  // The event that triggers the evaluation for a rule.
  invokingEvent: string
  // Key/value pairs that the function processes as part of its evaluation logic.
  ruleParameters: string
  // A token that the function must pass to AWS Config with the PutEvaluations call.
  resultToken: string
  // A Boolean value that indicates whether the AWS resource to be evaluated has been removed from the rule's scope.
  eventLeftScope: boolean
  // The ARN of the IAM role that is assigned to AWS Config.
  executionRoleArn: string
  // The ARN that AWS Config assigned to the rule.
  configRuleArn: string
  // The name that you assigned to the rule that caused AWS Config to publish the event and invoke the function.
  configRuleName: string
  // The ID that AWS Config assigned to the rule.
  configRuleId: string
  // The ID of the AWS account that owns the rule.
  accountId: string
  // A version number assigned by AWS.
  version: string
}

// Default invoking event
export interface ConfigInvokingEvent {
  messageType: ConfigMessageType
}

export interface ConfigParameters {
  [name: string]: string
}

// Available message types
export enum ConfigMessageType {
  ITEM_CHANGE = 'ConfigurationItemChangeNotification',
  OVERSIZED_ITEM_CHANGE = 'OversizedConfigurationItemChangeNotification',
  SCHEDULED_NOTIFICATION = 'ScheduledNotification'
}

// Invoking event for evaluations triggered by configuration changes
export interface ConfigChangeEvent extends ConfigInvokingEvent {
  configurationItem: ConfigConfigurationItem
}

interface ConfigConfigurationItemBase {
  ARN: string
  availabilityZone: string | null
  awsAccountId: string
  awsRegion: string
  configurationItemCaptureTime: string
  configurationItemStatus: ConfigConfigurationItemStatus
  resourceId: string
  resourceType: ResourceType
}

export enum ConfigConfigurationItemStatus {
  OK = 'OK',
  RESOURCE_DISCOVERED = 'ResourceDiscovered',
  RESOURCE_NOT_RECORDED = 'ResourceNotRecorded',
  RESOURCE_DELETED = 'ResourceDeleted',
  RESOURCE_DELETED_NOT_RECORDED = 'ResourceDeletedNotRecorded'
}

export interface ConfigConfigurationItem extends ConfigConfigurationItemBase {
  configuration: ConfigConfiguration
  relationships: [ConfigRelationship]
  tags: [Tag]
}

export interface ConfigRelationship {
  resourceName: string | undefined
  resourceId: string | undefined
  resourceType: ResourceType | undefined
  name: string | undefined
}

export interface ConfigConfiguration {
  [name: string]: string | undefined
}

export interface Tag {
  [name: string]: string
}

// Invoking event for evaluations triggered by oversized configuration changes
export interface ConfigOversizedChangeEvent extends ConfigInvokingEvent {
  configurationItemSummary: ConfigConfigurationItemSummary
}

export interface ConfigConfigurationItemSummary extends ConfigConfigurationItemBase {
  changeType: string // change to ENUM
  configurationItemVersion: string
  configurationStateId: number
  resourceName: string
  configurationStateMd5Hash: string
  resourceCreationTime: string
}

// Invoking event for evaluations triggered by periodic frequency
export interface ConfigPeriodicFrequencyEvent extends ConfigInvokingEvent {
  awsAccountId: string
  notificationCreationTime: string
  recordVersion: string
}
