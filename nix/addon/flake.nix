{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
  };
  outputs = { self, nixpkgs }: {
    nixosConfigurations.ec2-dev = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";
      modules = [
        "${nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
        {
          ec2.efi = true;
          virtualisation = {
            podman.enable = true;
            podman.dockerCompat = true;
            containerd.enable = true;
          };
        }
      ];
    };
  };
}
