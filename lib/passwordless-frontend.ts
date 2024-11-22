import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

import * as cdk from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { type CfnDistribution, PriceClass, ResponseHeadersPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { Construct } from 'constructs';

interface PasswordlessFrontendStackProps extends cdk.StackProps {
  passwordlessFrontendDistFolderPath: string;
}

const DOCKER_EXECUTABLE = process.env.CDK_DOCKER ?? 'docker';

export default class PasswordlessFrontendStack extends cdk.Stack {
  distributionDomainName: string;

  // eslint-disable-next-line class-methods-use-this
  buildContainer() {
    const args = [
      'build',
      'passwordless',
      '--build-context',
      'ttyd-git=https://github.com/tsl0922/ttyd.git',
      '-t',
    ];
    const hash = cdk.FileSystem.fingerprint('passwordless', {
      extraHash: args.join(' '),
      exclude: ['node_modules', 'dist', '.cognito'],
    });
    const tag = 'cdk-' + createHash('sha256')
      .update(hash)
      .update(args.join(' '))
      .digest('hex');

    const { stdout } = spawnSync(DOCKER_EXECUTABLE, ['image', 'inspect', tag]);
    const image = new cdk.DockerImage(tag, hash);
    if (stdout.length)
      return image;

    args.push(tag);
    spawnSync(DOCKER_EXECUTABLE, args, {
      stdio: [ // show Docker output
        'ignore', // ignore stdin
        process.stderr, // redirect stdout to stderr
        'inherit', // inherit stderr
      ],
    });
    return image;
  }

  constructor(scope: Construct, id: string, props: PasswordlessFrontendStackProps) {
    super(scope, id, props);

    const cloudfrontToS3 = new CloudFrontToS3(this, 'CloudFrontToS3', {
      cloudFrontDistributionProps: {
        priceClass: PriceClass.PRICE_CLASS_200,
      },
      insertHttpSecurityHeaders: false,
    });
    const {
      cloudFrontWebDistribution: distribution,
      s3Bucket: destinationBucket,
    } = cloudfrontToS3;
    if (!destinationBucket)
      throw new Error('cloudfrontToS3.s3Bucket is undefined');

    const cfnDistribution = distribution.node.defaultChild as CfnDistribution;
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
      ResponseHeadersPolicy.SECURITY_HEADERS.responseHeadersPolicyId,
    );

    const asset = new Asset(this, 'BundledAsset', {
      path: 'passwordless',
      bundling: {
        image: this.buildContainer(),
        workingDirectory: '/mnt/asset-input',
        command: ['pnpm', 'build', '--outDir', '/asset-output'],
        outputType: cdk.BundlingOutput.NOT_ARCHIVED,
        user: 'root:root',
      },
    });

    Source.bucket(asset.bucket, asset.s3ObjectKey);
    new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset(props.passwordlessFrontendDistFolderPath)],
      destinationBucket,
      distribution,
    });

    this.distributionDomainName = distribution.distributionDomainName;
    this.exportValue(this.distributionDomainName);
  }
}
