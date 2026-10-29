{
  inputs = {
    # https://github.com/NixOS/nixpkgs/commits/nixos-26.05/?author=nixpkgs-ci%5Bbot%5D
    # nixpkgs.url = "github:NixOS/nixpkgs/68f0bc4095d6034af52a098f233b7d73ba383d3b";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager.url = "github:nix-community/home-manager/release-26.05";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
    hjem.url = "github:feel-co/hjem";
    hjem.inputs.nixpkgs.follows = "nixpkgs";

    flake-utils.url = "github:numtide/flake-utils";

    npm-global-src.url = "../npm-global";
    npm-global-src.flake = false;
  };

  outputs = {
    self,
    nixpkgs,
    nixpkgs-unstable,
    home-manager,
    hjem,
    flake-utils,
    npm-global-src,
  }: let
    system = (import ./config.nix).system;
    username = (import ./config.nix).username;
    homeDirectory = (import ./config.nix).homeDirectory;

    pkgs = import nixpkgs {inherit system;};
    unstable-pkgs = import nixpkgs-unstable {
      inherit system;
      config.allowUnfree = true;
    };

    nodejs-global-bin = pkgs.buildNpmPackage {
      pname = "global-bin";
      version = "1.0.0";
      src = npm-global-src.outPath;
      npmDepsHash =
        # pkgs.lib.fakeHash;
        "sha256-ALdUMqPOruQNQ4jwLSPCEazW1UFfVSo1oi/L1ei+ALc=";
      dontNpmBuild = true;
      dontNpmPrune = true;
      npmDepsFetcherVersion = 2;
      nodejs = pkgs.nodejs_24;
      installPhase = ''
        mkdir -p $out/lib $out/bin
        cp -r * $out/lib/
        for file in node_modules/.bin/*; do
          ln -s $out/lib/node_modules/.bin/$(basename $file) $out/bin/$(basename $file)
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

    packages = with pkgs;
      [
        # Stable
        act
        alejandra
        asciinema
        aws-sam-cli
        basedpyright
        biome
        black
        cargo
        cargo-binstall
        cdktn-cli
        commitlint
        corepack_24
        dive
        docker-buildx
        eslint
        findutils
        git-cliff
        gitleaks
        glab
        gnumake
        hadolint
        htop
        infisical
        jq
        kubernetes-helm
        kyverno
        mariadb.client
        markdownlint-cli2
        nil
        nixos-rebuild
        nmap
        nodejs_24
        openssl.dev
        postgresql
        pre-commit
        python311
        redis
        ruff
        rustc
        rustfmt
        shellcheck
        shfmt
        skopeo
        sqlfluff
        ssm-session-manager-plugin
        stylelint
        systemctl-tui
        trino-cli
        typos
        typos-lsp
        watch
        wget
        yq-go

        # Unstable
        unstable-pkgs.atuin
        unstable-pkgs.aws-cdk-cli
        unstable-pkgs.devcontainer
        unstable-pkgs.github-copilot-cli
        unstable-pkgs.hugo
        unstable-pkgs.oxfmt
        unstable-pkgs.oxlint
        unstable-pkgs.tailscale
        unstable-pkgs.terraform
        unstable-pkgs.tsgolint

        # Custom
        hjem.packages.${system}.hjem
        nodejs-global-bin
      ]
      ++ (
        if pkgs.stdenv.isLinux
        then [
          garage_2
          k3s_1_34
          (lib.hiPrio unstable-pkgs.containerd)
          nerdctl
          containerd-rootless-setuptool
        ]
        else []
      );

    programs = {
      programs.atuin.package = unstable-pkgs.atuin;
      programs.awscli.package = unstable-pkgs.awscli2;
      programs.starship.package = unstable-pkgs.starship;

      # programs.vim.enable = true;
      programs.atuin.enable = true;
      programs.awscli.enable = true;
      programs.bat.enable = true;
      programs.fish.enable = true;
      programs.gh.enable = true;
      programs.git.enable = true;
      programs.git.lfs.enable = true;
      programs.go.enable = true;
      programs.lazygit.enable = true;
      programs.poetry.enable = true;
      programs.starship.enable = true;
      programs.uv.enable = true;
    };
  in (
    {
      # https://github.com/nix-community/home-manager/blob/ba4a1a110204c27805d1a1b5c8b24b3a0da4d063/templates/standalone/flake.nix
      homeConfigurations.${username} = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;

        modules = [
          {
            home.stateVersion = "26.05";
            home.username = username;
            home.homeDirectory = homeDirectory;

            nix.package = pkgs.nix;
            nix.settings = {
              extra-experimental-features = ["nix-command" "flakes"];
            };

            programs.home-manager.enable = true;

            home.packages =
              packages
              ++ (with pkgs; [
                lapce
              ]);

            xdg.configFile = {
              "git/config".enable = false;
              "git/ignore".enable = false;
              "git/attributes".enable = false;
            };
          }
          programs
        ];
      };

      homeManagerModules.default = {...}:
        {
          home.stateVersion = "26.05";
          home.packages = packages;
        }
        // programs;
    }
    // flake-utils.lib.eachDefaultSystem (system: {
      devShells.default = pkgs.mkShell {inherit packages;};
    })
  );
}
