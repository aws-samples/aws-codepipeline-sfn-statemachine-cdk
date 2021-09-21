import codecommit = require('@aws-cdk/aws-codecommit');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import s3 = require('@aws-cdk/aws-s3');
import iam = require('@aws-cdk/aws-iam');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/core');
import {App, CfnCapabilities, RemovalPolicy, Stack, StackProps} from '@aws-cdk/core';
import {CodeBuildConstruct} from "./codebuild-construct";
import * as sfn from '@aws-cdk/aws-stepfunctions';
import {CodepipelineIamConstruct} from "./codepipeline-iam-construct";

export interface CodePipelineStackProps extends StackProps {
    sourceRepoName: string,
    artifactBucketName: string,
    kmsKeyId: string,
    kmsKeyRegion: string,
    prodAccountId: string,
    codePipelineRoleName: string,
    cfnDeployRoleName: string,
}

export class CodePipelineStack extends Stack {

    constructor(app: App, id: string, props: CodePipelineStackProps) {
        super(app, id, props);

        const repository =
            codecommit.Repository.fromRepositoryName(this, 'SfnCodeCommitRepository', props.sourceRepoName);

        const keyArnFromKeyId = `arn:aws:kms:${props.kmsKeyRegion}:${cdk.Aws.ACCOUNT_ID}:key/${props.kmsKeyId}`;
        const key = kms.Key.fromKeyArn(this, 'ArtifactBucketEncKey', keyArnFromKeyId);
        key.grantDecrypt(iam.Role.fromRoleArn(this, 'cross-cfn-role',
            `arn:aws:iam::${props.prodAccountId}:role/${props.codePipelineRoleName}`, {mutable: false}));

        const artifactBucket = s3.Bucket.fromBucketAttributes(this, 'SfnArtifactBucket',
            {
                bucketName: props.artifactBucketName,
                encryptionKey: key
            });

        // Create IAM Roles
        const codepipelineIamRole = 'CodePipelineRole-4PVV5QMKJ60HO'
        const codepipelineCfnDeployRole = 'CodePipelineCfnDeployRole-0WYTZHE10BS13'

        new CodepipelineIamConstruct(this, 'codepipeline-iam-roles', {
            devAccountId: cdk.Aws.ACCOUNT_ID,
            artifactBucketName: props.artifactBucketName,
            kmsKeyId: props.kmsKeyId,
            kmsKeyRegion: props.kmsKeyRegion,
            codePipelineRoleName: codepipelineIamRole,
            cfnDeployRoleName: codepipelineCfnDeployRole
        })

        const buildConstruct = new CodeBuildConstruct(this, 'CdkSynthBuild', {key: key});
        const cdkBuild = buildConstruct.buildProject;

        // CodeCommit source action
        const sourceOutput = new codepipeline.Artifact();
        const sourceStage =
            {
                stageName: 'Source',
                actions: [
                    new codepipeline_actions.CodeCommitSourceAction({
                        actionName: 'CodeCommit_Source',
                        repository: repository,
                        branch: 'main',
                        output: sourceOutput,
                    }),
                ],
            }

        // CodeBuild build action
        const cdkBuildOutput = new codepipeline.Artifact('CdkBuildOutput');
        const buildStage =
            {
                stageName: 'Build',
                actions: [
                    new codepipeline_actions.CodeBuildAction({
                        actionName: 'CDK_Synth',
                        project: cdkBuild,
                        input: sourceOutput,
                        outputs: [cdkBuildOutput],
                    }),
                ],
            }

        // CloudFormation deploy stack action
        const deployAppDevStage =
            {
                stageName: 'Deploy_to_Dev',
                actions: [
                    new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                        actionName: 'Deploy_Application',
                        templatePath: cdkBuildOutput.atPath('ApplicationStack.template.json'),
                        stackName: 'KinesisApplicationStack',
                        deploymentRole: iam.Role.fromRoleArn(this, 'codepipeline-cfn-deploy-role',
                            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${codepipelineCfnDeployRole}`,
                            {mutable: false}),
                        adminPermissions: false,
                        role: iam.Role.fromRoleArn(this, 'codepipeline-action-role',
                            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${codepipelineIamRole}`,
                            {mutable: false}),
                        variablesNamespace: 'Deploy_Application_Ns',
                        cfnCapabilities: [CfnCapabilities.ANONYMOUS_IAM, CfnCapabilities.NAMED_IAM]
                    })
                ],
            }

        // Deploy Step Function and Invoke Step Function
        const integrationTestDevStage =
            {
                stageName: 'Integration_Test',
                actions: [
                    new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                        actionName: 'Deploy_Integration_Test_StateMachine',
                        templatePath: cdkBuildOutput.atPath('IntegTestSfnStack.template.json'),
                        stackName: 'IntTestSfnStack',
                        deploymentRole: iam.Role.fromRoleArn(this, 'integtest-codepipeline-cfn-deploy-role',
                            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${codepipelineCfnDeployRole}`,
                            {mutable: false}),
                        adminPermissions: false,
                        role: iam.Role.fromRoleArn(this, 'integtest-codepipeline-action-role',
                            `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${codepipelineIamRole}`,
                            {mutable: false}),
                        runOrder: 1,
                        variablesNamespace: 'Deploy_Integration_Test_Sfn_Ns',
                        cfnCapabilities: [CfnCapabilities.ANONYMOUS_IAM, CfnCapabilities.NAMED_IAM]
                    }),
                    new codepipeline_actions.StepFunctionInvokeAction({
                        actionName: 'Invoke_StateMachine',
                        stateMachine: sfn.StateMachine.fromStateMachineArn(this, 'int-test-sfn',
                            `arn:aws:states:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stateMachine:DevSfnStackStateMachine`),
                        stateMachineInput: codepipeline_actions.StateMachineInput.literal({
                            'KinesisInputStreamName': '#{Deploy_Application_Ns.KinesisInputStreamName}',
                            'FirehoseOutputBucket': '#{Deploy_Application_Ns.FirehoseOutputBucket}',
                            'waitSeconds': '30',
                            'record_count': 1000
                        }),
                        runOrder: 2
                    }),
                ],
            }

        // Manual Approval Stage
        const manualApproveStage = {
            stageName: 'Manual_Approve',
            actions: [
                new codepipeline_actions.ManualApprovalAction({
                    actionName: 'Deploy_to_Prod',
                }),
            ],
        }

        // CloudFormation deploy stack action
        const deployAppProdStage =
            {
                stageName: 'Deploy_to_Prod',
                actions: [
                    new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                        actionName: 'Deploy_Firehose_Prod',
                        templatePath: cdkBuildOutput.atPath('ApplicationStack.template.json'),
                        stackName: 'KinesisApplicationStack',
                        deploymentRole: iam.Role.fromRoleArn(this, 'prod-cross-cfn-deploy-role',
                            `arn:aws:iam::${props.prodAccountId}:role/${props.cfnDeployRoleName}`,
                            {mutable: false}),
                        adminPermissions: false,
                        role: iam.Role.fromRoleArn(this, 'prod-cross-cfn-role',
                            `arn:aws:iam::${props.prodAccountId}:role/${props.codePipelineRoleName}`,
                            {mutable: false}),
                        cfnCapabilities: [CfnCapabilities.ANONYMOUS_IAM, CfnCapabilities.NAMED_IAM]
                    })
                ],
            }


        // Create CodePipeline
        new codepipeline.Pipeline(this, 'kinesis-application-pipeline', {
            pipelineName: 'KinesisApplicationPipeline',
            artifactBucket: artifactBucket,
            stages: [
                sourceStage,
                buildStage,
                deployAppDevStage,
                integrationTestDevStage,
                manualApproveStage,
                deployAppProdStage
            ]
        })

        new cdk.CfnOutput(this, 'CfnOutputRepositoryName', {
            value: repository.repositoryName
        });
        new cdk.CfnOutput(this, 'CfnOutputCodeCommitHttpUrl', {
            value: repository.repositoryCloneUrlHttp
        });
    }
}