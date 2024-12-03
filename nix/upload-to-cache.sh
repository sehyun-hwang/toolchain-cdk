#!/bin/sh
set -eu
set -f # disable globbing
export IFS=' '
echo "Uploading paths" $OUT_PATHS

# TODO uncomment
# eval $(jq -r '.Credentials | "export AWS_ACCESS_KEY_ID=\(.AccessKeyId); export AWS_SECRET_ACCESS_KEY=\(.SecretAccessKey); export AWS_SESSION_TOKEN=\(.SessionToken)"' ~/.aws/cli/cache/*.json)

nix copy --to "s3://vscodeec2stack-nixcachebucket0b0ca413-ym0o7vipjfti?region=ap-northeast-1" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
nix copy --to "s3://vscodeec2stack-us-nixcachebucket0b0ca413-xbebyry8slzj?region=us-west-2" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
