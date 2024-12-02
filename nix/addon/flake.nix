rec {
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    home-manager.url = "github:nix-community/home-manager/release-24.05";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    my-new.url = "path:my-new-project";
    my-new.inputs.nixpkgs.follows = "nixpkgs";

    vscode-cli-json-path.url = "https://code.visualstudio.com/sha";
    vscode-cli-json-path.flake = false;
    vscode-server.url = "github:nix-community/nixos-vscode-server";
    nix-index-database.url = "github:nix-community/nix-index-database";
    nix-index-database.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
      "s3://vscodeec2stack-us-nixcachebucket0b0ca413-xbebyry8slzj?region=us-west-2"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "s3:LS6iTIMsz7LS9yurWFwITUCY3k87zaLKoVBlssVqnpw="
    ];
    secret-key-files = "/etc/nix/key.private";
    # post-build-hook = "echo";
    # @TODO Needs testing
    post-build-hook = /etc/nix/upload-to-cache.sh;
  };

  outputs = {
    self,
    nixpkgs,
    home-manager,
    my-new,
    vscode-cli-json-path,
    vscode-server,
    nix-index-database,
  }: {
    nixosConfigurations.ec2-dev = nixpkgs.lib.nixosSystem {
      system = "aarch64-linux";

      modules = [
        "${nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"
        home-manager.nixosModules.home-manager
        vscode-server.nixosModules.default
        nix-index-database.nixosModules.nix-index

        {
          ec2.efi = true;
          system.stateVersion = "24.05";
          nix.settings = {
            experimental-features = ["nix-command" "flakes"];
            substituters = nixConfig.extra-substituters;
            trusted-public-keys = nixConfig.extra-trusted-public-keys;
            secret-key-files = "/etc/nix/key.private";
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
              exec nix copy --to s3://${nixpkgs.lib.lists.last nixConfig.extra-substituters} $OUT_PATHS
            '';
          };

          systemd.services.test-nvme1n1 = {
            unitConfig.ConditionPathExists = "/dev/nvme1n1";
            script = ''
              lsblk -N /dev/nvme1n1 | grep 'Amazon EC2 NVMe Instance Storage'
            '';
            serviceConfig = {
              Type = "oneshot";
              RemainAfterExit = "yes";
            };
          };
          fileSystems."/media" = {
            device = "/dev/nvme1n1";
            fsType = "ext4";
            autoFormat = true;
            options = [
              "x-systemd.requires=test-nvme1n1.service"
              "noauto"
            ];
          };
          swapDevices = [
            {
              device = "/media/swapfile";
              size = 6 * 1024; # MB
              options = [
                "x-systemd.after=media.mount"
                "noauto"
                "nofail"
              ];
            }
          ];

          virtualisation = {
            podman.enable = true;
            podman.dockerCompat = true;
            containerd.enable = true;
          };

          users.mutableUsers = false;
          # services.amazon-ssm-agent.enable = nixpkgs.lib.mkForce false;
          users.users.ssm-user = {
            uid = 1010;
          };
          users.users.ec2-user = {
            isNormalUser = true;
            home = "/home/ec2-user";
            extraGroups = [
              "wheel"
              "networkmanager"
              "ec2-user"
            ];
            openssh.authorizedKeys.keys = [
              "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONFCHikp7AoWYCj8aCtIO1rBAN0hB2gwtoEM/LjWA5p centos@www.hwangsehyun.com"
            ];
            uid = 1000;
            linger = true;
          };
          users.groups.ec2-user.gid = 1000;

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
              users = ["ec2-user"];
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
            systemd.services.test-nvme1n1.path = [pkgs.util-linux pkgs.gnugrep];

            programs.fish.enable = true;
            environment.systemPackages = with pkgs; [
              buildkit
              iotop
              nerdctl
              rootlesskit
              runc
              slirp4netns
              wget
            ];
            users.users.ec2-user = {
              shell = pkgs.fish;
            };
          }
        )

        (
          {
            config,
            lib,
            pkgs,
            ...
          }: let
            cacert-unbundled-pem = pkgs.stdenv.mkDerivation {
              pname = "cacert-unbundled-pem";
              version = "0.0.1";
              src = pkgs.cacert.unbundled;

              buildPhase = ''
                for input in etc/ssl/certs/*; do
                  output=$(echo $input | sed 's/:.*\.crt$/.pem/')
                  echo $input $output
                  ${pkgs.openssl_3_3}/bin/openssl x509 -in $input -out $output
                done

                ${pkgs.openssl_3_3}/bin/c_rehash etc/ssl/certs
              '';

              installPhase = ''
                mkdir -p $out/etc/ssl
                mv etc/ssl/certs $out/etc/ssl/certs
              '';
            };

            log-file = "/var/log/ec2-instance-connect.log";

            ec2-instance-connect-inputs = with pkgs; [
              coreutils
              curl
              findutils
              gawk
              gnugrep
              gnused
              logger
              openssh
              openssl_3_3
            ];

            ec2-instance-connect = pkgs.resholve.mkDerivation {
              pname = "ec2-instance-connect";
              version = "0.0.1";

              src = pkgs.fetchFromGitHub {
                owner = "aws";
                repo = "aws-ec2-instance-connect-config";
                rev = "1.1.17";
                sha256 = "sha256-XXrVcmgsYFOj/1cD45ulFry5gY7XOkyhmDV7yXvgNhI=";
              };

              buildPhase = ''
                cat > hello <<EOF
                #! $SHELL
                echo "Hello Nixers!"
                EOF
                chmod +x hello
                sed -i "s=/usr/bin/==g; 1 ! s=/bin/==g; s=>\s*/dev/null=>> ${log-file}=g; s=trap 'rm=trap '${pkgs.coreutils}/bin/rm="  src/bin/*
                grep underscored src/bin/eic_parse_authorized_keys
              '';

              installPhase = ''
                install -D -t $out/bin hello src/bin/eic_curl_authorized_keys src/bin/eic_parse_authorized_keys
              '';

              solutions.curl = {
                interpreter = "/bin/sh";
                scripts = ["bin/eic_curl_authorized_keys"];
                inputs = ec2-instance-connect-inputs;
                fix = {
                  "$OPENSSL" = ["${pkgs.openssl_3_3}/bin/openssl"];
                  "$ca_path" = ["${cacert-unbundled-pem}/etc/ssl/certs"];
                };
                execer = [
                  "cannot:${pkgs.gnused}/bin/sed"
                  "cannot:${pkgs.findutils}/bin/find"
                  "cannot:${pkgs.gawk}/bin/awk"
                  "cannot:${pkgs.openssh}/bin/ssh-keygen"
                ];
                keep = {
                  "$DIR" = true;
                };
              };

              solutions.parse = {
                interpreter = "/bin/sh";
                scripts = ["bin/eic_parse_authorized_keys"];
                inputs = ec2-instance-connect-inputs;
                execer = [
                  "cannot:${pkgs.gnused}/bin/sed"
                  "cannot:${pkgs.findutils}/bin/find"
                  "cannot:${pkgs.gawk}/bin/awk"
                  "cannot:${pkgs.openssh}/bin/ssh-keygen"
                ];
                keep = {
                  "$DIR" = true;
                  "$OPENSSL" = true;
                };
              };
            };
          in {
            system.activationScripts.createEc2InstanceConnectLogFile = lib.stringAfter ["var"] ''
              install -m 666 /dev/null /var/log/ec2-instance-connect.log
            '';
            environment.systemPackages = [ec2-instance-connect];
            environment.etc.eic_run_authorized_keys = {
              mode = "0755";
              text = ''
                #!${pkgs.bash}/bin/sh
                curl -H "X-aws-ec2-metadata-token: $(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")" http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key
                exec ${pkgs.coreutils}/bin/timeout 5s ${ec2-instance-connect}/bin/eic_curl_authorized_keys "$@"
              '';
            };
            users.users.ec2-instance-connect = {
              isSystemUser = true;
              group = "nogroup";
            };

            services.openssh.authorizedKeysCommand = "/etc/eic_run_authorized_keys %u %f";
            services.openssh.authorizedKeysCommandUser = "ec2-instance-connect";
            # services.openssh.settings.LogLevel = "DEBUG3";

            fileSystems."/mnt" = {
              # device = "fs-0bc069ca12afa12fe.efs.ap-northeast-1.amazonaws.com:/";
              device = "172.31.33.129:/";
              fsType = "nfs";
              # https://docs.aws.amazon.com/efs/latest/ug/mounting-fs-mount-cmd-dns-name.html
              options = [
                "nfsvers=4.1"
                "rsize=1048576"
                "wsize=1048576"
                "hard"
                "timeo=600"
                "retrans=2"
                "noresvport"
              ];
            };
          }
        )

        {
          home-manager.sharedModules = [
            vscode-server.homeModules.default
            nix-index-database.hmModules.nix-index
          ];

          home-manager.users.ec2-user = {
            pkgs,
            lib,
            ...
          }: let
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
              if pkgs.stdenv.isLinux
              then "alpine"
              else "darwin";
            vscode-cli-arch =
              if pkgs.stdenv.isAarch64
              then "arm64"
              else "x64";
            vscode-cli-source-json = builtins.fromJSON (builtins.readFile vscode-cli-json-path);
            vscode-cli-product =
              lib.lists.findFirst (
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
          in {
            home.stateVersion = "24.05";
            home.packages = with pkgs;
              [
                alejandra
                black
                corepack_22
                gnumake
                hadolint
                markdownlint-cli2
                nodejs_22
                oxlint
                ruff
                shfmt
                stylelint
                typos
                typos-lsp

                vscode-cli
                containerd-rootless-setuptool
              ]
              ++ (with pkgs.nodePackages; [
                eslint
                prettier
              ]);

            services.vscode-server.enable = true;
            services.vscode-server.installPath = "$HOME/.vscode";

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

            programs.awscli.settings.default = {
              sso_account_id = "248837585826";
              region = "ap-northeast-1";
              sso_start_url = "https://d-90678ca7cb.awsapps.com/start";
              sso_region = "us-east-1";
              sso_registration_scopes = "sso:account:access";
              sso_role_name = "AdministratorAccess";
            };
            programs.git = {
              userName = "Sehyun Hwang";
              userEmail = "hwanghyun3@gmail.com";
              lfs.enable = true;
              ignores = ["DS_Store"];
            };

            programs.nix-index.enableFishIntegration = true;
            programs.vim.defaultEditor = true;
            programs.vim.settings = {
              number = true;
            };
          };
        }
      ];
    };
  };
}
