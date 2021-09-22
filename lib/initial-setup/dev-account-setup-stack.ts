// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import codecommit = require('@aws-cdk/aws-codecommit');
import {App, RemovalPolicy, Stack, StackProps} from '@aws-cdk/core';
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/core');
import iam = require('@aws-cdk/aws-iam');
import s3 = require('@aws-cdk/aws-s3');

export class DevAccountSetupStack extends Stack {
    constructor(app: App, id: string, props: StackProps) {
        super(app, id, props);

        // Read context params
        const prodAccountId = app.node.tryGetContext('prodAccId')
        const artifactBucketName = app.node.tryGetContext('codePipelineArtifactBucketName')
        const repoName = app.node.tryGetContext('codeCommitRepoName')

        // Create Codecommit repo
        const repo = new codecommit.Repository(this, 'CodeCommitRepo', {
            repositoryName: repoName,
            description: 'SfnIntegTestCodeCommitRepo',
        });

        // Create KMS Key
        const key = new kms.Key(this, 'ArtifactKey', {
            alias: 'key/artifact-key',
            enableKeyRotation: true
        });

        const prodAccountRootPrincipal = new iam.AccountPrincipal(prodAccountId)
        key.grantDecrypt(prodAccountRootPrincipal);

        // Create Artifact Bucket
        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            bucketName: artifactBucketName,
            removalPolicy: RemovalPolicy.DESTROY,
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: key,
            versioned: true
        });
        artifactBucket.grantPut(prodAccountRootPrincipal);
        artifactBucket.grantRead(prodAccountRootPrincipal);

        // Stack Outputs
        // KMS Key
        new cdk.CfnOutput(this, 'CfnOutputCodePipelineKmsKeyArn', {
            value: key.keyArn
        });
        // CodeCommit repository
        new cdk.CfnOutput(this, 'CfnOutputRepositoryUrl', {
            value: repo.repositoryCloneUrlHttp
        });
        // S3 Artifact Bucket
        new cdk.CfnOutput(this, 'CfnOutputArtifactBucket', {
            value: artifactBucket.bucketName
        });
    }
}