{ 
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    home-manager.url = "github:nix-community/home-manager/release-24.05";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, home-manager }: let 
    ec2-instance-connect-git = builtins.fetchGit {
      url = "https://github.com/aws/aws-ec2-instance-connect-config.git";
      ref = "refs/tags/1.1.17";
    };
  in {
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

          users.mutableUsers = false;
          users.groups.ec2-user.gid = 1000;
          users.users.ec2-user = {
            isNormalUser  = true;
            home  = "/home/ec2-user";
            extraGroups  = [ "wheel" "networkmanager" "ec2-user" ];
            /* @TODO curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-keys/0/openssh-key */
            openssh.authorizedKeys.keys  = [ "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIONFCHikp7AoWYCj8aCtIO1rBAN0hB2gwtoEM/LjWA5p centos@www.hwangsehyun.com" ];
            uid = 1000;
          };

          services.openssh.extraConfig = "";
          security.sudo.extraRules = [{
              users = [ "ec2-user" ];
              commands = [{
                command = "ALL";
                options = [ "NOPASSWD" ];
              }];
          }];
        }

        home-manager.nixosModules.home-manager
        {
          home-manager.users.ec2-user = { pkgs, ... }: {
            home.stateVersion = "24.05";
            home.packages = [];
            programs.fish.enable = true;

            programs.atuin.enable = true;
            programs.atuin.enableFishIntegration = true;
            programs.awscli.enable = true;
            programs.awscli.settings.default = {
              sso_account_id = "248837585826";
              region = "ap-northeast-2";
              sso_start_url = "https://d-90678ca7cb.awsapps.com/start";
              sso_region = "us-east-1";
              sso_registration_scopes = "sso:account:access";
              sso_role_name = "AdministratorAccess";
            };
            programs.bat.enable = true;
            programs.gh.enable = true;
            programs.git.enable = true;
            programs.git.lfs.enable = true;
            programs.git.ignores = [ "DS_Store" ];
            programs.command-not-found.enable = true;
            programs.go.enable = true;
            programs.lazygit.enable = true;
            programs.poetry.enable = true;
            programs.powerline-go.enable  = true;
            programs.vim.enable = true;
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
