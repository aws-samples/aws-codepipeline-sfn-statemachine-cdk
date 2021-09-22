#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import {CodePipelineStack} from "../lib/codepipeline/codepipeline-stack";
import {ApplicationStack} from "../lib/application/application-stack";
import {IntegrationTestStack} from "../lib/integration-test/integration-test-stack";
import {CrossAccountIamStack} from "../lib/initial-setup/cross-account-iam-stack";
import {DevAccountSetupStack} from "../lib/initial-setup/dev-account-setup-stack";

const app = new cdk.App();

// Read context params
const prodAccountId = app.node.tryGetContext('prodAccId')
const devAccountRegion = app.node.tryGetContext('devAccRegion')
const kmsKeyId = app.node.tryGetContext('keyId')
const codePipelineArtifactBucketName = app.node.tryGetContext('codePipelineArtifactBucketName')
const codeCommitRepoName = app.node.tryGetContext('codeCommitRepoName')
const codePipelineCrossAccountRole = app.node.tryGetContext('codePipelineCrossAccountRole')
const cloudformationCrossAccountRole = app.node.tryGetContext('cloudformationCrossAccountRole')


// Setup KMS key, Codecommit repository, Artifact bucket in Dev account
new DevAccountSetupStack(app, 'CodeCommitStack', {})

// Setup IAM Roles in Prod account
new CrossAccountIamStack(app, 'CrossAccountIamStack', {})

// Create CodePipelineStack Stack
new CodePipelineStack(app, 'CodePipelineStack', {
    sourceRepoName: codeCommitRepoName,
    artifactBucketName: codePipelineArtifactBucketName,
    kmsKeyId: kmsKeyId,
    kmsKeyRegion: devAccountRegion,
    prodAccountId: prodAccountId,
    codePipelineRoleName: codePipelineCrossAccountRole,
    cfnDeployRoleName: cloudformationCrossAccountRole
});

// Application Stack
new ApplicationStack(app, 'ApplicationStack', {})

// IntegrationTest Stack
new IntegrationTestStack(app, 'IntegTestSfnStack', {});