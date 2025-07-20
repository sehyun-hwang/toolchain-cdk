#!/bin/sh
set -eux

export IFS=' '
echo "Uploading paths" $OUT_PATHS

set -f # disable globbing
~/.nix-profile/bin/nix copy --to "s3://nix-cache20250622060138522200000002?scheme=http&endpoint=erin-hwang-mac:9000" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
