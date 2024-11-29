{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    home-manager.url = "github:nix-community/home-manager/release-24.05";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    my-new.url = "path:my-new-project";
    my-new.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
      my-new,
    }:
    {

      nixosConfigurations.ec2-dev = nixpkgs.lib.nixosSystem {
        system = "aarch64-linux";

        modules = [
          "${nixpkgs}/nixos/modules/virtualisation/amazon-image.nix"

          {
            ec2.efi = true;
            swapDevices = [
              {
                device = "/var/lib/swapfile";
                size = 16 * 1024; # MB
              }
            ];
            nix.settings.experimental-features = [
              "nix-command"
              "flakes"
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
              # @TODO curl -H "X-aws-ec2-metadata-token: $(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")" http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key
              openssh.authorizedKeys.keys = [
                "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONFCHikp7AoWYCj8aCtIO1rBAN0hB2gwtoEM/LjWA5p centos@www.hwangsehyun.com"
              ];
              uid = 1000;
            };
            users.groups.ec2-user.gid = 1000;

            services.openssh.settings.PasswordAuthentication = false;
            services.openssh.settings.KexAlgorithms = [
              "curve25519-sha256@libssh.org"
              "ecdh-sha2-nistp521"
              "ecdh-sha2-nistp384"
              "ecdh-sha2-nistp256"
              "diffie-hellman-group-exchange-sha256"
            ];
            security.sudo.extraRules = [
              {
                users = [ "ec2-user" ];
                commands = [
                  {
                    command = "ALL";
                    options = [ "NOPASSWD" ];
                  }
                ];
              }
            ];
          }

          (
            { pkgs, ... }:
            {
              programs.fish.enable = true;
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
            }:
            let
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
                  mkdir -p $out/bin
                  cp hello $out/bin/
                  cd src/bin
                  mv eic_curl_authorized_keys eic_parse_authorized_keys $out/bin/
                '';

                solutions.curl = {
                  interpreter = "/bin/sh";
                  scripts = [ "bin/eic_curl_authorized_keys" ];
                  inputs = ec2-instance-connect-inputs;
                  fix = {
                    "$OPENSSL" = [ "${pkgs.openssl_3_3}/bin/openssl" ];
                    "$ca_path" = [ "${cacert-unbundled-pem}/etc/ssl/certs" ];
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
                  scripts = [ "bin/eic_parse_authorized_keys" ];
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
            in
            {
              # environment.etc."ssl/openssl.cnf" = {
              #   text = builtins.fetchurl {
              #     url = "https://raw.githubusercontent.com/openssl/openssl/21f7a09ca256eee0ccc9a8fc498e8427469ab506/apps/openssl.cnf";
              #     sha256 = "1206z64mn7zjvww3s3ssaaz5cq0v3p9jcsc441s21zsajpzna31s";
              #   };
              # };
              system.activationScripts.createEc2InstanceConnectLogFile = lib.stringAfter [ "var" ] ''
                install -m 666 /dev/null /var/log/ec2-instance-connect.log
              '';

              environment.systemPackages = [ ec2-instance-connect ];

              environment.etc.eic_run_authorized_keys = {
                mode = "0755";
                text = ''
                  #!${pkgs.bash}/bin/sh
                  exec ${pkgs.coreutils}/bin/timeout 5s ${ec2-instance-connect}/bin/eic_curl_authorized_keys "$@" 
                '';
              };

              users.users.ec2-instance-connect = {
                isSystemUser = true;
                group = "nogroup";
              };

              services.openssh.authorizedKeysCommand = "/etc/eic_run_authorized_keys %u %f";
              services.openssh.authorizedKeysCommandUser = "ec2-instance-connect";
              services.openssh.settings.LogLevel = "DEBUG3";

              # mandb build fails due to fish
              documentation.man = {
                man-db.enable = false;
                mandoc.enable = true;
              };
            }
          )

          home-manager.nixosModules.home-manager
          {
            home-manager.users.ec2-user =
              { pkgs, ... }:
              {
                home.stateVersion = "24.05";
                home.packages = [ ];

                programs.awscli.enable = true;
                programs.bat.enable = true;
                programs.fish.enable = true;
                programs.gh.enable = true;
                programs.git.enable = true;
                programs.go.enable = true;
                programs.lazygit.enable = true;
                programs.poetry.enable = true;
                programs.starship.enable = true;
                programs.vim.enable = true;

                programs.git.lfs.enable = true;
                programs.git.ignores = [ "DS_Store" ];
                programs.awscli.settings.default = {
                  sso_account_id = "248837585826";
                  region = "ap-northeast-1";
                  sso_start_url = "https://d-90678ca7cb.awsapps.com/start";
                  sso_region = "us-east-1";
                  sso_registration_scopes = "sso:account:access";
                  sso_role_name = "AdministratorAccess";
                };
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
