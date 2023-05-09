# Serverless Governance: Custom Rules

Repository of custom AWS Config rules to test compliance of Serverless resources.

Rules currently include:

* *Desired Layer Version* - checks that one or more Lambda layers are associated with all Lambda functions. Desired layer ARN(s) can be specified as a rule parameter named `requiredLayerArns`.
* *No Deprecated Runtimes* - checks that Lambda functions do not use [deprecated runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html#runtime-support-policy) as documented by AWS. Can specify additional runtimes as deprecated (or not allowed) using a rule parameter named `otherDeprecatedRuntimes`.

## Deployment

An example stack is included in the [`/example`](/example/) directory. Custom config rules are implemented as AWS Lambda function written in Typescript. Example template deploys the needed functions and permissions as well as sets up the Config rules. Three sample functions are included for evaluation.

To deploy:

```
npm install

sam build

sam deploy --guided
```

Follow the prompts to complete deployment. Visit the [AWS Config console](https://console.aws.amazon.com/config/home) to view compliance of the sample functions. Note that the rule functions will be listed as well.