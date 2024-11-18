import * as cdk from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { type CfnDistribution, PriceClass, ResponseHeadersPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { Construct } from 'constructs';

interface PasswordlessFrontendStackProps extends cdk.StackProps {
  passwordlessFrontendDistFolderPath: string;
}

export default class PasswordlessFrontendStack extends cdk.Stack {
  distributionDomainName: string;

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

    new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset(props.passwordlessFrontendDistFolderPath)],
      destinationBucket,
      distribution,
    });

    this.distributionDomainName = distribution.distributionDomainName;
    this.exportValue(this.distributionDomainName);
  }
}
