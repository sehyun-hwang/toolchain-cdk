#!/bin/sh
set -eux

export IFS=' '
echo "Uploading paths" $OUT_PATHS

# https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/identify_ec2_instances.html
grep ^i- /sys/devices/virtual/dmi/id/board_asset_tag \
  && TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600") \
  && curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region \
  || eval $(jq -r '.Credentials | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId); export AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey); export AWS_SESSION_TOKEN=\(.SessionToken)"' ~/.aws/cli/cache/*.json)

[ -z "$AWS_ACCESS_KEY_ID" ] && exit 0

set -f # disable globbing
# nix copy --to "s3://vscodeec2stack-nixcachebucket0b0ca413-ym0o7vipjfti?region=ap-northeast-1" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
# nix copy --to "s3://vscodeec2stack-us-nixcachebucket0b0ca413-xbebyry8slzj?region=us-west-2" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
