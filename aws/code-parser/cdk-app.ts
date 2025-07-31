#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

class CodeParserStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function with Python runtime
    const codeParserLambda = new lambda.Function(this, 'CodeParserFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-code')),
      handler: 'handler.main',
      functionName: 'supastate-code-parser',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        PYTHONPATH: '/var/runtime',
      },
      description: 'Parses code and extracts language-specific attributes for Supastate'
    });

    // Output the Lambda function ARN
    new cdk.CfnOutput(this, 'CodeParserFunctionArn', {
      value: codeParserLambda.functionArn,
      description: 'ARN of the Code Parser Lambda function',
    });

    // Output the Lambda function name
    new cdk.CfnOutput(this, 'CodeParserFunctionName', {
      value: codeParserLambda.functionName,
      description: 'Name of the Code Parser Lambda function',
    });
  }
}

const app = new cdk.App();
new CodeParserStack(app, 'SupastateCodeParserStack', {
  env: {
    region: process.env.AWS_REGION || 'us-east-1'
  }
});