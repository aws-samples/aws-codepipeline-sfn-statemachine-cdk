import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
import fs = require("fs");
import {Duration, Stack, StackProps} from '@aws-cdk/core';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';

export class IntegrationTestStack extends Stack {

    constructor(scope: cdk.Construct, id: string, props: StackProps) {
        super(scope, id);

        const generateKinesisEventsLambda = new lambda.Function(this, 'GenerateKinesisEventsLambda', {
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.inline(fs.readFileSync('lib/integration-test/lambda/generate_kinesis_events.py').toString()),
            timeout: Duration.seconds(300),
            handler: 'index.generate_kinesis_events',
        });

        const getStatusLambda = new lambda.Function(this, 'GetStatusLambda', {
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.inline(fs.readFileSync('lib/integration-test/lambda/get_test_status.py').toString()),
            timeout: Duration.seconds(300),
            handler: 'index.get_test_status',
        });

        const cleanUpS3Lambda = new lambda.Function(this, 'CleanUpS3Lambda', {
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.inline(fs.readFileSync('lib/integration-test/lambda/delete_s3_objects.py').toString()),
            timeout: Duration.seconds(300),
            handler: 'index.clean_s3',
        });

        // Define Succeess, Fail, ErrorAndFail states
        const testFailOnErrorState = new sfn.Fail(this, 'Handle Error and Fail.', {
            comment: 'Handle Error and Exit.',
        });

        const testFailedState = new sfn.Fail(this, 'Test Failed', {
            comment: 'Output data does not match Expected Result',
            error: 'Data Mismatch',
            cause: 'Data mismatch'
        });

        const testSuccessState = new sfn.Succeed(this, 'Test Success', {
            comment: 'Output data matches Expected Result'
        });

        const testSuccessFailBranch = new sfn.Choice(this, 'Check Result')
            .when(sfn.Condition.stringEquals('$.status', 'FAILED'), testFailedState)
            .when(sfn.Condition.stringEquals('$.status', 'SUCCEEDED'), testSuccessState)

        // Define Tasks
        const beforeTestCleanUpTask = new tasks.LambdaInvoke(this, 'BeforeTest-Clean S3', {
            lambdaFunction: cleanUpS3Lambda,
            outputPath: '$.Payload',
        });

        const generateKinesisEventsTask = new tasks.LambdaInvoke(this, 'Publish events to Kinesis Stream', {
            lambdaFunction: generateKinesisEventsLambda,
            inputPath: '$',
            outputPath: '$.Payload',
        });

        const getOutputDataTask = new tasks.LambdaInvoke(this, 'Validate data from output S3 bucket', {
            lambdaFunction: getStatusLambda,
            inputPath: '$',
            outputPath: '$.Payload',
        });

        const afterTestCleanUpTask = new tasks.LambdaInvoke(this, 'AfterTest-Clean S3', {
            lambdaFunction: cleanUpS3Lambda,
            inputPath: '$',
            outputPath: '$.Payload',
        });

        // Set up wait loop
        const cleanUpAndEndTestChain = afterTestCleanUpTask
            .addCatch(testFailOnErrorState)
            .next(testSuccessFailBranch);

        const waitXState = new sfn.Wait(this, 'Wait for input event processing', {
            time: sfn.WaitTime.secondsPath('$.waitSeconds'),
        });

        const waitOrProceedBranch = new sfn.Choice(this, 'Proceed if validation complete, Otherwise Wait')
            .when(sfn.Condition.stringEquals('$.status', 'FAILED'), cleanUpAndEndTestChain)
            .when(sfn.Condition.stringEquals('$.status', 'SUCCEEDED'), cleanUpAndEndTestChain)
            .otherwise(waitXState)

        // Create StateMachine
        const definition = beforeTestCleanUpTask.addCatch(testFailOnErrorState)
            .next(generateKinesisEventsTask.addCatch(testFailOnErrorState))
            .next(waitXState)
            .next(getOutputDataTask.addCatch(testFailOnErrorState))
            .next(waitOrProceedBranch);

        const logGroup = new logs.LogGroup(this, 'SfnDevIntegrationTestLogGroup');
        const sfnRole = new iam.Role(this, 'SfnKinesisFirehoseRole', {
            assumedBy: new iam.ServicePrincipal('states.amazonaws.com')
        });

        const integrationTestSfn = new sfn.StateMachine(this, 'DevSfnStackStateMachine', {
            definition: definition,
            stateMachineName: 'DevSfnStackStateMachine',
            timeout: Duration.minutes(5),
            role: sfnRole,
            logs: {destination: logGroup, level: sfn.LogLevel.ERROR},
        });

        // Set Lambda permissions
        generateKinesisEventsLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'));
        generateKinesisEventsLambda.role?.addManagedPolicy(
            iam.ManagedPolicy.fromManagedPolicyName(this, 'test1', 'SfnLambdaKinesisPolicy2'));
        getStatusLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'));
        getStatusLambda.role?.addManagedPolicy(
            iam.ManagedPolicy.fromManagedPolicyName(this, 'test2', 'SfnLambdaKinesisPolicy2'));
        cleanUpS3Lambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'));
        cleanUpS3Lambda.role?.addManagedPolicy(
            iam.ManagedPolicy.fromManagedPolicyName(this, 'test3', 'SfnLambdaKinesisPolicy2'));

        generateKinesisEventsLambda.grantInvoke(sfnRole);
        getStatusLambda.grantInvoke(sfnRole);
        cleanUpS3Lambda.grantInvoke(sfnRole);

        // Stack Outputs
        new cdk.CfnOutput(this, 'SfnArn', {value: integrationTestSfn.stateMachineArn});
    }
}