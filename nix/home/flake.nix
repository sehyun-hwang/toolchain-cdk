{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nixpkgs-nerdctl.url = "github:06kellyjac/nixpkgs/nerdctl";
    home-manager.url = "github:nix-community/home-manager/release-24.11";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    flake-utils.url = "github:numtide/flake-utils";
    copilot-cli-fix.url = "github:meatcoder/nix-copilot-cli/2595f0517c88b1ca68faff2d3132e498e7c8e349";
    copilot-cli-fix.inputs.nixpkgs.follows = "nixpkgs";

    vscode-cli-json-path.url = "https://code.visualstudio.com/sha";
    vscode-cli-json-path.flake = false;
  };

  outputs = {
    self,
    nixpkgs,
    nixpkgs-unstable,
    nixpkgs-nerdctl,
    home-manager,
    vscode-cli-json-path,
    copilot-cli-fix,
    flake-utils,
  }: let
    system = "aarch64-linux";
    pkgs = import nixpkgs {inherit system;};
    unstable-pkgs = import nixpkgs-unstable {inherit system;};
    nerdctl-pkgs = import nixpkgs-nerdctl {inherit system;};

    nodejs-global-bin = pkgs.buildNpmPackage {
      pname = "global-bin";
      version = "1.0.0";
      src =
        if builtins.pathExists ./npm-global
        then ./npm-global
        else ../npm-global;
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

    containerd-rootless-setuptool = pkgs.stdenv.mkDerivation {
      pname = "containerd-rootless-setuptool";
      version = pkgs.nerdctl.version;
      src = "${pkgs.nerdctl.src}/extras/rootless";

      buildPhase = ''
        sed -i '1 ! s=/bin/==g' *.sh
      '';

      installPhase = ''
        install -D -t $out/bin *.sh
      '';
    };

    vscode-cli-os =
      if pkgs.stdenv.isDarwin
      then "darwin"
      else "alpine";
    vscode-cli-arch =
      if pkgs.stdenv.isAarch64
      then "arm64"
      else "x64";
    vscode-cli-source-json = builtins.fromJSON (builtins.readFile vscode-cli-json-path);
    vscode-cli-product =
      nixpkgs.lib.lists.findFirst (
        product:
          product.build == "stable" && product.platform.os == "cli-${vscode-cli-os}-${vscode-cli-arch}"
      )
      null
      vscode-cli-source-json.products;

    vscode-cli = pkgs.stdenv.mkDerivation {
      pname = "vscode-cli";
      version = vscode-cli-product.productVersion;
      sourceRoot = ".";
      src = builtins.fetchurl {
        url = vscode-cli-product.url;
        sha256 = vscode-cli-product.sha256hash;
      };

      installPhase = ''
        ./code --version
        install -D -t $out/bin code
      '';
    };

    packages = with pkgs;
      [
        act
        alejandra
        black
        corepack_22
        gnumake
        hadolint
        hugo
        markdownlint-cli2
        nil
        nixos-rebuild
        nodejs_22
        otpw
        oxlint
        postgresql
        ruff
        shellcheck
        shfmt
        stylelint
        typos
        typos-lsp

        nerdctl-pkgs.nerdctl
        unstable-pkgs.atuin

        containerd-rootless-setuptool
        copilot-cli-fix.packages.${system}.default
        nodejs-global-bin
        vscode-cli
      ]
      ++ [
        (pkgs.python312.withPackages
          (p: [
            "aws-shell"
          ]))
      ]
      ++ (with pkgs.nodePackages; [
        prettier
      ]);

    programs = {
      programs.atuin.package = unstable-pkgs.atuin;

      programs.atuin.enable = true;
      programs.awscli.enable = true;
      programs.bat.enable = true;
      programs.fish.enable = true;
      programs.gh.enable = true;
      programs.git.enable = true;
      programs.go.enable = true;
      programs.lazygit.enable = true;
      programs.nix-index.enable = true;
      programs.poetry.enable = true;
      programs.starship.enable = true;
      programs.vim.enable = true;
    };
  in (
    {
      # https://github.com/nix-community/home-manager/blob/ba4a1a110204c27805d1a1b5c8b24b3a0da4d063/templates/standalone/flake.nix
      homeConfigurations."hwanghyun3" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;

        modules = [
          {
            home.stateVersion = "24.11";
            home.username = "hwanghyun3";
            home.homeDirectory = "/home/hwanghyun3";

            home.packages = packages;
            programs.home-manager.enable = true;
          }
          programs
        ];
      };

      homeManagerModules.default = {...}:
        {
          home.stateVersion = "24.11";
          home.packages = packages;
        }
        // programs;
    }
    // flake-utils.lib.eachDefaultSystem (system: {
      devShells.default = pkgs.mkShell {inherit packages;};
    })
  );
}
