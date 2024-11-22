import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { symlinkSync } from 'fs';

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
const CONTAINER_NAME = 'cdk-passwordless-frontend';

export default class PasswordlessFrontendStack extends cdk.Stack {
  distributionDomainName: string;

  // eslint-disable-next-line class-methods-use-this
  buildContainer(exclude: string[]) {
    const args = [
      'build',
      'passwordless',
      '--build-context',
      'ttyd-git=https://github.com/tsl0922/ttyd.git',
      '-t',
    ];
    const hash = cdk.FileSystem.fingerprint('passwordless', {
      extraHash: args.join(' '),
      exclude,
    });
    const tag = CONTAINER_NAME + ':' + createHash('sha256')
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

    const path = cdk.FileSystem.mkdtemp('passwordless-frontend-asset-input-');
    const exclude = ['node_modules', 'dist', '.cognito'];
    cdk.FileSystem.copyDirectory(process.cwd() + '/passwordless', path, {
      exclude,
    });
    symlinkSync('/mnt/node_modules', path + '/node_modules');
    symlinkSync('/mnt/ttyd', path + '/ttyd');
    console.log('Frontend temp dir', path);

    const asset = new Asset(this, 'BundledAsset', {
      path,
      bundling: {
        image: this.buildContainer(exclude),
        command: ['pnpm', 'build', '--outDir', '/asset-output'],
        outputType: cdk.BundlingOutput.NOT_ARCHIVED,
        user: 'root:root', // For rootless container runtimes
      },
    });
    console.log('Frontend asset path', asset.assetPath);

    const bucketDeployment = new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.bucket(asset.bucket, asset.s3ObjectKey)],
      destinationBucket,
      distribution,
    });

    this.distributionDomainName = distribution.distributionDomainName;
    this.exportValue(this.distributionDomainName);
  }
}
