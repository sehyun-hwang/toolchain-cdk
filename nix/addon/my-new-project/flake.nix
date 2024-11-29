{
  description = "my package";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }: {
    nixosModules = {
          # packages.myPackage = pkgs.callPackage ./myPackage { };
            mySuperUserModule = { ... }:  {
              config = {
              environment.systemPackages = [  ];
            };
          };
        };
      };
    # flake-utils.lib.eachDefaultSystem (system:
    #   let
    #     pkgs = import nixpkgs { inherit system; };
    #     myPackage = self.packages.${system}.myPackage;
    #   in {

    #   }
    # );
}