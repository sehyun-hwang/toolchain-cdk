FROM nixos/nix:2.25.3

RUN nix-env -i fish nixos-rebuild jq awscli2 \
	&& mkdir /mnt
WORKDIR /mnt

COPY flake.nix /mnt/
RUN nixos-rebuild --flake .#ec2-dev build

ENTRYPOINT ["fish"]
