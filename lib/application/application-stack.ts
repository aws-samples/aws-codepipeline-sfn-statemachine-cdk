// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import fs = require('fs');
import cdk = require('@aws-cdk/core');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');
import kds = require('@aws-cdk/aws-kinesis');
import lambda = require('@aws-cdk/aws-lambda');
import {App, Duration, Stack, StackProps} from '@aws-cdk/core';
import {FirehoseConstruct} from './firehose-construct';
import {BucketEncryption} from "@aws-cdk/aws-s3";
import {StreamEncryption} from "@aws-cdk/aws-kinesis";


export class ApplicationStack extends Stack {

    constructor(app: App, id: string, props: StackProps) {
        super(app, id, props);

        const bucket = new s3.Bucket(this, 'FirehoseBucket', {
            versioned: true,
            encryption: BucketEncryption.S3_MANAGED
        });

        const stream = new kds.Stream(this, 'InputStream', {
            shardCount: 2,
            encryption: StreamEncryption.MANAGED
        });

        const processEventLambda = fs.readFileSync('lib/application/lambda/process-kinesis-event.js').toString();

        const processEvents = new lambda.Function(this, 'ProcessEventsLambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.inline(processEventLambda),
            timeout: Duration.seconds(60),
            handler: 'index.handler'
        });

        new FirehoseConstruct(this, 'FirehoseConstruct', {
            bucket: bucket,
            inputStream: stream,
            lambda: processEvents
        });

        //Create lambda execution policy
        const lambdaExecRole = new iam.Role(this, 'StepFunctionsLambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            roleName: 'KinesisStackStepFunctionsLambdaExecutionRole'
        });

        const lambdaKinesisPolicy = new iam.CfnManagedPolicy(this, 'SfnLambdaKinesisPolicy2', {
            roles: [lambdaExecRole.roleName],
            managedPolicyName: 'SfnLambdaKinesisPolicy2',
            policyDocument: iam.PolicyDocument.fromJson({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Action": ['s3:AbortMultipartUpload',
                            's3:GetBucketLocation',
                            's3:GetObject',
                            's3:ListBucket',
                            's3:PutObject',
                            's3:DeleteObject',
                            's3:DeleteObjectVersion'],
                        "Resource": [bucket.bucketArn,
                            bucket.arnForObjects('*')],
                        "Effect": "Allow"
                    },
                    {
                        "Action": ['kinesis:DescribeStream',
                            "kinesis:DescribeStreamSummary",
                            "kinesis:GetRecords",
                            "kinesis:GetShardIterator",
                            "kinesis:ListShards",
                            "kinesis:ListStreams",
                            "kinesis:SubscribeToShard",
                            'kinesis:PutRecord',
                            'kinesis:PutRecords'],
                        "Resource": [stream.streamArn],
                        "Effect": "Allow"
                    }]
            })
        })

        //Stack Outputs
        new cdk.CfnOutput(this, 'FirehoseOutputBucket', {value: bucket.bucketName});
        new cdk.CfnOutput(this, 'KinesisInputStreamName', {value: stream.streamName});
    }
}