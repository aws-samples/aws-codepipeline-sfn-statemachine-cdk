import codebuild = require('@aws-cdk/aws-codebuild');
import kms = require('@aws-cdk/aws-kms');
import cdk = require('@aws-cdk/core');

export interface CodeBuildConstructProps {
    key: kms.IKey
}

export class CodeBuildConstruct extends cdk.Construct {

    public readonly buildProject: codebuild.PipelineProject

    constructor(scope: cdk.Construct, id: string, props: CodeBuildConstructProps) {
        super(scope, id);

        // Scan CFN templates in POST_BUILD using CFN-NAG
        this.buildProject = new codebuild.PipelineProject(this, 'CdkBuild', {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        runtime: {nodejs: 14},
                        commands: [
                            'npm install',
                            'yum -y install gem',
                            'gem install cfn-nag'
                        ],
                    },
                    build: {
                        commands: [
                            'npm run build',
                            'npm run cdk synth -- -o dist'
                        ],
                    },
                    post_build: {
                        commands: [
                            'for filename in dist/*Stack.template.json; do (cfn_nag_scan -i $filename); [ $? -eq 0 ]  || exit 1 ; done'
                        ]
                    }
                },
                artifacts: {
                    'base-directory': 'dist',
                    files: [
                        '*Stack.template.json',
                    ],
                },
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_3,
            },
            encryptionKey: props.key
        });
    }
}
