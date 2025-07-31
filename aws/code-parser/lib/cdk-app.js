#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const path = require("path");
class CodeParserStack extends cdk.Stack {
    constructor(scope, id, props) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLWFwcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2Nkay1hcHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCw2QkFBNkI7QUFFN0IsTUFBTSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JDLFlBQVksS0FBYyxFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qiw2Q0FBNkM7UUFDN0MsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3ZFLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ2hFLE9BQU8sRUFBRSxjQUFjO1lBQ3ZCLFlBQVksRUFBRSx1QkFBdUI7WUFDckMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsY0FBYzthQUMzQjtZQUNELFdBQVcsRUFBRSxxRUFBcUU7U0FDbkYsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLGdCQUFnQixDQUFDLFdBQVc7WUFDbkMsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsWUFBWTtZQUNwQyxXQUFXLEVBQUUseUNBQXlDO1NBQ3ZELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBQzFCLElBQUksZUFBZSxDQUFDLEdBQUcsRUFBRSwwQkFBMEIsRUFBRTtJQUNuRCxHQUFHLEVBQUU7UUFDSCxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVztLQUM5QztDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5jbGFzcyBDb2RlUGFyc2VyU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkFwcCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbiB3aXRoIFB5dGhvbiBydW50aW1lXG4gICAgY29uc3QgY29kZVBhcnNlckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvZGVQYXJzZXJGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICdsYW1iZGEtY29kZScpKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyLm1haW4nLFxuICAgICAgZnVuY3Rpb25OYW1lOiAnc3VwYXN0YXRlLWNvZGUtcGFyc2VyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBZVEhPTlBBVEg6ICcvdmFyL3J1bnRpbWUnLFxuICAgICAgfSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGFyc2VzIGNvZGUgYW5kIGV4dHJhY3RzIGxhbmd1YWdlLXNwZWNpZmljIGF0dHJpYnV0ZXMgZm9yIFN1cGFzdGF0ZSdcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCB0aGUgTGFtYmRhIGZ1bmN0aW9uIEFSTlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2RlUGFyc2VyRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogY29kZVBhcnNlckxhbWJkYS5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBDb2RlIFBhcnNlciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBMYW1iZGEgZnVuY3Rpb24gbmFtZVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2RlUGFyc2VyRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IGNvZGVQYXJzZXJMYW1iZGEuZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBDb2RlIFBhcnNlciBMYW1iZGEgZnVuY3Rpb24nLFxuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5uZXcgQ29kZVBhcnNlclN0YWNrKGFwcCwgJ1N1cGFzdGF0ZUNvZGVQYXJzZXJTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnXG4gIH1cbn0pOyJdfQ==