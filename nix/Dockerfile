FROM nixos/nix

RUN nix-env -i fish nixos-rebuild \
	&& mkdir /mnt
WORKDIR /mnt

COPY flake.nix /mnt/
RUN nixos-rebuild --flake .#ec2-dev build --fast

ENTRYPOINT ["fish"]
