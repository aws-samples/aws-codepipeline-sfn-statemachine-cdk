// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import cdk = require('@aws-cdk/core');
import kds = require('@aws-cdk/aws-kinesis');
import s3 = require('@aws-cdk/aws-s3');
import iam = require('@aws-cdk/aws-iam');
import kdf = require('@aws-cdk/aws-kinesisfirehose');
import lambda = require('@aws-cdk/aws-lambda');
import {CfnResource} from "@aws-cdk/core";

export interface FirehoseConstructProps {
    bucket: s3.Bucket,
    inputStream: kds.Stream,
    lambda: lambda.Function
}

export class FirehoseConstruct extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: FirehoseConstructProps) {
        super(scope, id);

        const firehoseRole = new iam.Role(this, 'FirehoseRole', {
            assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
        });

        props.bucket.grantReadWrite(firehoseRole);
        props.lambda.grantInvoke(firehoseRole);

        const s3Policy = (new iam.PolicyStatement({
            actions:
                ['s3:AbortMultipartUpload',
                    's3:GetBucketLocation',
                    's3:GetObject',
                    's3:ListBucket',
                    's3:PutObject',
                    's3:ListBucketMultipartUploads'],
            resources: [props.bucket.bucketArn]
        }));

        firehoseRole.addToPolicy(s3Policy);

        const firehosePolicy = new iam.Policy(this, 'FirehoseKinesisPolicy', {
            roles: [firehoseRole],
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['kinesis:DescribeStream',
                        'kinesis:GetShardIterator',
                        'kinesis:GetRecords'],
                    resources: [props.inputStream.streamArn]
                }),
            ],
        });

        const firehose = new kdf.CfnDeliveryStream(this, 'FirehoseDeliveryStream', {
            deliveryStreamType: 'KinesisStreamAsSource',
            kinesisStreamSourceConfiguration: {
                kinesisStreamArn: props.inputStream.streamArn,
                roleArn: firehoseRole.roleArn,
            },
            extendedS3DestinationConfiguration: {
                bucketArn: props.bucket.bucketArn,
                bufferingHints: {
                    intervalInSeconds: 60,
                    sizeInMBs: 1
                },
                compressionFormat: 'UNCOMPRESSED',
                roleArn: firehoseRole.roleArn,
                prefix: 'kinesis-stream-data/',
                processingConfiguration: {
                    enabled: true,
                    processors: [
                        {
                            type: 'Lambda',
                            parameters: [
                                {
                                    parameterName: 'LambdaArn',
                                    parameterValue: props.lambda.functionArn
                                }
                            ]
                        }
                    ]
                }
            }
        });

        //enforce creating the firehosePolicy before the firehose stream
        firehose.addDependsOn(firehosePolicy.node.defaultChild as CfnResource);
    }
}