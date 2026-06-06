rec {
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    home-manager.url = "github:nix-community/home-manager/release-26.05";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    vscode-server.url = "github:nix-community/nixos-vscode-server";
    nix-index-database.url = "github:nix-community/nix-index-database";

    addon.url = "path:./home";
    addon.inputs.nixpkgs.follows = "nixpkgs";
    addon.inputs.home-manager.follows = "home-manager";

    npm-global-src.url = "./npm-global";
    npm-global-src.flake = false;
    addon.inputs.npm-global-src.follows = "npm-global-src";
  };

  inputs.nixos-crostini.url = "github:aldur/nixos-crostini";

  # Optional:
  inputs.nixos-crostini.inputs.nixpkgs.follows = "nixpkgs";

  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
      # "s3://vscodeec2stack-nixcachebucket0b0ca413-ym0o7vipjfti?region=ap-northeast-1"
      # "s3://vscodeec2stack-us-nixcachebucket0b0ca413-xbebyry8slzj?region=us-west-2"
    ];
    # secret-key-files = /etc/nix/key.private;
    # post-build-hook = ./upload-to-cache.sh;
  };

  outputs = {
    self,
    nixpkgs,
    home-manager,
    vscode-server,
    nix-index-database,
    addon,
    npm-global-src,
nixos-crostini
  }: {
    nixosConfigurations.baguette-nixos = nixpkgs.lib.nixosSystem rec {      
system = "aarch64-linux";

      modules = [
        # "${nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
        home-manager.nixosModules.home-manager
        vscode-server.nixosModules.default
        nix-index-database.nixosModules.nix-index
nixos-crostini.nixosModules.baguette
        {
          system.stateVersion = "26.05";
          nix.settings = {
            extra-experimental-features = ["nix-command" "flakes"];
            # secret-key-files = "/etc/nix/key.private";
            # post-build-hook = "/etc/nix/upload-to-cache.sh";
          };
          environment.etc."nix/upload-to-cache.sh" = {
            mode = "555";
            text = ''
              #!/bin/sh
              set -eu
              set -f # disable globbing
              export IFS=' '
              echo "Uploading paths" $OUT_PATHS
              exec nix copy --to ${nixpkgs.lib.lists.last nixConfig.extra-substituters} $OUT_PATHS
            '';
          };

          virtualisation = {
            podman.enable = true;
            podman.dockerCompat = true;
            containerd.enable = true;
          };

          users.mutableUsers = false;
          users.users.aldur = {
            isNormalUser = true;
            home = "/home/aldur";
            extraGroups = [
              "wheel"
              "networkmanager"
            ];
            openssh.authorizedKeys.keys = [
              "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONFCHikp7AoWYCj8aCtIO1rBAN0hB2gwtoEM/LjWA5p centos@www.hwangsehyun.com"
            ];
            uid = 1000;
            linger = true;
          };

          services.openssh.settings.PasswordAuthentication = false;
          # https://infosec.mozilla.org/guidelines/openssh#modern-openssh-67
          services.openssh.settings.KexAlgorithms = [
            "curve25519-sha256@libssh.org"
            "ecdh-sha2-nistp521"
            "ecdh-sha2-nistp384"
            "ecdh-sha2-nistp256"
            "diffie-hellman-group-exchange-sha256"
          ];
          security.sudo.extraRules = [
            {
              users = ["aldur"];
              commands = [
                {
                  command = "ALL";
                  options = ["NOPASSWD"];
                }
              ];
            }
          ];

          # mandb build fails due to fish
          documentation.man = {
            man-db.enable = false;
            mandoc.enable = true;
          };
        }

        (
          {pkgs, ...}: {
            programs.fish.enable = true;
            environment.systemPackages = with pkgs; [
              buildkit
              docker-buildx
              file
              git
              iotop
              jq
              nerdctl
              rootlesskit
              runc
              slirp4netns
              unzip
              wget
              zip
            ];
            users.users.aldur = {
              shell = pkgs.fish;
            };

            services.cockpit.enable = true;
            security.pam.services.cockpit = {
              otpwAuth = true;
            };
          }
        )

        {
          home-manager.sharedModules = [
            vscode-server.homeModules.default
            nix-index-database.homeModules.nix-index
          ];

          home-manager.users.aldur = {pkgs, ...}: {
            imports = [
              addon.homeManagerModules.default
            ];
            home.stateVersion = "26.05";
            home.sessionPath = [
              "$HOME/.yarn/bin"
              "$HOME/.local/share/pnpm"
            ];
            home.sessionVariables = {
              CDK_DOCKER = "/nix/store/7nxcx3ai95xdshnpr5ykpc4xdf9lh7ap-nerdctl-2.0.0/bin/nerdctl";
              COREPACK_ENABLE_AUTO_PIN = "0";
              DOCKER_HOST = "$XDG_RUNTIME_DIR/podman/podman.sock";
              PNPM_HOME = "$HOME/.local/share/pnpm";
            };
            home.file.".otpw" = {
              source = ./otpw;
            };

            services.vscode-server.enable = true;
            services.vscode-server.installPath = "$HOME/.vscode";

            programs.atuin.settings = {
              search_mode = "prefix";
              inline_height = 5;
            };
            programs.awscli.settings.default = {
              region = "ap-northeast-1";
              credential_source = "Ec2InstanceMetadata";
              role_arn = "arn:aws:iam::248837585826:role/VsCodeEc2Stack-Us-AdministratorAccessRole1EE9C9E4-11QChk3JOS7W";
            };
            programs.awscli.settings.sso = {
              sso_account_id = "248837585826";
              region = "ap-northeast-1";
              sso_start_url = "https://d-90678ca7cb.awsapps.com/start";
              sso_region = "us-east-1";
              sso_registration_scopes = "sso:account:access";
              sso_role_name = "AdministratorAccess";
            };
            programs.git = {
              settings = {
                user.name = "Sehyun Hwang";
                user.email = "hwanghyun3@gmail.com";
              };
              lfs.enable = true;
              ignores = ["DS_Store"];
            };

            programs.nix-index.enableFishIntegration = true;
            programs.vim.defaultEditor = true;
            programs.vim.settings = {
              number = true;
            };

            programs.fish.interactiveShellInit =
              ''
                complete --command aws --no-files --arguments '(begin; set --local --export COMP_SHELL fish; set --local --export COMP_LINE (commandline); aws_completer | sed \'s/ $//\'; end)'
              ''
              + (
                if pkgs.stdenv.isDarwin
                then ''
                  export ATUIN_SYNC_ADDRESS=http://atuin.orb.local:8888
                ''
                else ''
                  set DOCKER_PS_ATUIN_PORT (docker ps -f name=atuin --format '{{.Ports}}')
                  if test -z $DOCKER_PS_ATUIN_PORT
                      echo Atuin sync server is not running
                  else
                      export ATUIN_SYNC_ADDRESS=(echo $DOCKER_PS_ATUIN_PORT | sed -n 's=.*:\([0-9]*\)->.*=http://localhost:\1=p')
                  end
                ''
              );
          };
        }
      ];
    };
  };
}
