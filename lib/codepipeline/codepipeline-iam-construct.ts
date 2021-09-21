import cdk = require('@aws-cdk/core');
import iam = require('@aws-cdk/aws-iam');
import {App, Construct, Stack, StackProps} from '@aws-cdk/core';
import {Effect} from "@aws-cdk/aws-iam";

export interface CodepipelineIamConstructProps {
    devAccountId: string,
    artifactBucketName: string,
    kmsKeyId: string,
    kmsKeyRegion: string,
    codePipelineRoleName: string,
    cfnDeployRoleName: string,
}

export class CodepipelineIamConstruct extends Construct {

    constructor(scope: Construct, id: string, props: CodepipelineIamConstructProps) {
        super(scope, id);

        const keyArnFromKeyId = `arn:aws:kms:${props.kmsKeyRegion}:${props.devAccountId}:key/${props.kmsKeyId}`;

        // CloudFormationDeploymentRole
        const cfnDeploymentRole = new iam.Role(scope, 'CloudFormationDeploymentRole', {
            assumedBy: new iam.ServicePrincipal('cloudformation.amazonaws.com'),
            roleName: props.cfnDeployRoleName
        });

        // CloudFormationDeploymentRole policy document
        const cfnPolicyDocument = iam.PolicyDocument.fromJson({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "iam:PassRole",
                    "Resource": `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/*`,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "iam:GetRole",
                        "iam:GetRolePolicy",
                        "iam:PutRolePolicy",
                        "iam:CreateRole",
                        "iam:DeleteRole",
                        "iam:DeleteRolePolicy",
                        "iam:DetachRolePolicy",
                        "iam:AttachRolePolicy",
                        "iam:GetPolicy",
                        "iam:CreatePolicy",
                        "iam:DeletePolicy",
                        "iam:ListPolicyVersions"
                    ],
                    "Resource": [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/*`,
                        `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:policy/*`],
                    "Effect": "Allow"
                },
                {
                    "Action": ["kinesis:CreateStream",
                        "kinesis:ListStreams",
                        "kinesis:DescribeStreamSummary",
                        "kinesis:StartStreamEncryption",
                        "kinesis:DeleteStream"],
                    "Resource": `arn:aws:kinesis:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stream/*`,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "firehose:DescribeDeliveryStream",
                        "firehose:ListDeliveryStreams",
                        "firehose:CreateDeliveryStream",
                        "firehose:DeleteDeliveryStream"
                    ],
                    "Resource": `arn:aws:firehose:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:deliverystream/*`,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "lambda:CreateFunction",
                        "lambda:DeleteFunction"
                    ],
                    "Resource": `arn:aws:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*`,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "s3:CreateBucket",
                        "s3:DeleteBucket",
                        "s3:PutBucketTagging",
                        "s3:DeleteBucketTagging",
                        "s3:PutBucketVersioning",
                        "s3:SetBucketEncryption",
                        "s3:GetEncryptionConfiguration",
                        "s3:PutEncryptionConfiguration"
                    ],
                    "Resource": "*",
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "s3:GetBucketLocation",
                        "s3:GetObject",
                        "s3:ListBucket",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:DeleteObjectVersion",
                    ],
                    "Resource": [
                        `arn:aws:s3:::${props.artifactBucketName}`,
                        `arn:aws:s3:::${props.artifactBucketName}/*`
                    ],
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "kms:DescribeKey",
                        "kms:GenerateDataKey",
                        "kms:Encrypt",
                        "kms:ReEncryptTo",
                        "kms:ReEncryptFrom",
                        "kms:Decrypt"
                    ],
                    "Resource": keyArnFromKeyId,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "logs:CreateLogGroup",
                        "logs:DeleteLogGroup",
                        "logs:PutRetentionPolicy",
                        "logs:CreateLogStream",
                        "logs:DeleteLogStream",
                        "logs:PutLogEvents",
                        "logs:DescribeLogGroups",
                        "logs:DeleteRetentionPolicy"
                    ],
                    "Resource": `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:*`,
                    "Effect": "Allow"
                },
                {
                    "Action": [
                        "states:CreateStateMachine",
                        "states:DeleteStateMachine",
                        "states:DescribeStateMachine",
                        "states:ListStateMachines",
                        "states:TagResource"
                    ],
                    "Resource": [`arn:aws:states:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stateMachine:*`],
                    "Effect": "Allow"
                },
            ]
        })

        const cfnPolicy = new iam.Policy(scope, 'CrossAccountCfnDeployPolicy', {
            document: cfnPolicyDocument,
        });
        cfnPolicy.attachToRole(cfnDeploymentRole)

        // CodePipeline Cross-Account Role
        const codePipelineCrossAccountRole = new iam.Role(scope, 'CodePipelineCrossAccountRole', {
            assumedBy: iam.Role.fromRoleArn(this, 'DevAccountRootPrincipal', `arn:aws:iam::${props.devAccountId}:root/`),
            roleName: props.codePipelineRoleName
        });

        // Add s3 permissions
        codePipelineCrossAccountRole.addToPolicy(
            new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    "s3:GetBucketLocation",
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:PutObject",
                    "s3:DeleteObject",
                    "s3:DeleteObjectVersion",
                ],
                resources: [
                    `arn:aws:s3:::${props.artifactBucketName}`,
                    `arn:aws:s3:::${props.artifactBucketName}/*`
                ],
            }))

        // Add kms permissions
        codePipelineCrossAccountRole.addToPolicy(
            new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    "kms:DescribeKey",
                    "kms:GenerateDataKey",
                    "kms:Encrypt",
                    "kms:ReEncryptFrom",
                    "kms:ReEncryptTo",
                    "kms:Decrypt"
                ],
                resources: [keyArnFromKeyId],
            }))

        // Add cfn permissions
        codePipelineCrossAccountRole.addToPolicy(
            new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["cloudformation:DescribeStacks",
                    "cloudformation:CreateStack",
                    "cloudformation:UpdateStack",],
                resources: [`arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/KinesisApplicationStack/*`,
                    `arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/IntTestSfnStack/*`],
            }))

        // Add passrole permissions
        codePipelineCrossAccountRole.addToPolicy(
            new iam.PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["iam:PassRole"],
                resources: [cfnDeploymentRole.roleArn],
            }))
    }
}
