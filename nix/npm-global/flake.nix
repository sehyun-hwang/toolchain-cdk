{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};
        package = pkgs.buildNpmPackage {
          pname = "global-bin";
          version = "1.0.0";
          src = ./.;
          npmDepsHash = "sha256-ALDbRAwPnMnBWNTBj1rtjX74jAGqG+jEfK0iuhHVcmo=";
          dontNpmBuild = true;
          dontNpmPrune = true;

          installPhase = ''
            mkdir -p $out/bin
            cp -r * $out/
            for file in node_modules/.bin/*; do
              ln -s $out/node_modules/.bin/$(basename $file) $out/bin/$(basename $file)
            done
          '';
        };
      in {
        packages.default = package;

        devShells.default = pkgs.mkShell {
          packages = [pkgs.nodejs_22 package];
        };
      }
    );
}
