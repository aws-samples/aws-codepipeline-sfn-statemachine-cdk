// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {App, Stack, StackProps} from '@aws-cdk/core';
import {CodepipelineIamConstruct} from "../codepipeline/codepipeline-iam-construct";


export class CrossAccountIamStack extends Stack {

    constructor(scope: App, id: string, props: StackProps) {
        super(scope, id, props);

        // Create IAM Roles required by CodePipeline
        new CodepipelineIamConstruct(this, 'CodepipelineCloudformationIamRoles', {
            devAccountId: this.node.tryGetContext('devAccId'),
            artifactBucketName: this.node.tryGetContext('codePipelineArtifactBucketName'),
            kmsKeyId: this.node.tryGetContext('keyId'),
            kmsKeyRegion: this.node.tryGetContext('devAccRegion'),
            codePipelineRoleName: this.node.tryGetContext('codePipelineCrossAccountRole'),
            cfnDeployRoleName: this.node.tryGetContext('cloudformationCrossAccountRole')
        })
    }
}
