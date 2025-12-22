#!/bin/sh
set -eux

export IFS=' '
echo "Uploading paths" $OUT_PATHS

set -f # disable globbing
~/.nix-profile/bin/nix copy --to "s3://nix-cache?profile=garage&region=garage&scheme=http&endpoint=http://erin-hwang-mac:3900" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
