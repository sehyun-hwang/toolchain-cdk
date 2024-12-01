{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    home-manager.url = "github:nix-community/home-manager/release-24.05";
  };

  outputs = {
    self,
    nixpkgs,
    home-manager,
  }: {
    nixosConfigurations.ec2-dev = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";
      modules = ["${nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"];
    };
  };
}
