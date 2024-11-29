FROM nixos/nix

RUN nix-env --install nixos-rebuild vim \
	&& mkdir /mnt
WORKDIR /mnt

COPY flake.nix /mnt/
RUN nixos-rebuild --flake .#ec2-dev build --fast
