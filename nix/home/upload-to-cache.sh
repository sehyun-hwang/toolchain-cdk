#!/bin/sh
set -eux

export IFS=' '
echo "Uploading paths" $OUT_PATHS

set -f # disable globbing
/nix/var/nix/profiles/default/bin/nix copy --to "s3://nix-cache?scheme=http&endpoint=127.0.0.1:9000" $OUT_PATHS >> /tmp/upload-to-cache.log 2>> /tmp/upload-to-cache.error.log
