# Nix Configurations

## [Base](./base)

```sh
cd base
nerdctl build . -t nix-ec2-dev
```

## [Home](./home)

[Home Manager](https://github.com/nix-community/home-manager) `switch`

```sh
cd home
nix run --extra-experimental-features 'nix-command flakes' home-manager -- switch --flake . --extra-experimental-features 'nix-command flakes'
# Without substitution
home-manager switch --flake .
# With substitution
home-manager switch --flake . --option extra-substituters 's3://nix-cache?profile=garage&region=garage&scheme=http&endpoint=erin-hwang-mac:3900' --option post-build-hook $PWD/upload-to-cache.sh
```

Nix shell

```sh
cd home
nix develop --extra-experimental-features 'nix-command flakes'
```

## Nix OS

```sh
nix registry add home-addon $PWD/home
sudo nixos-rebuild --flake .#ec2-dev switch --fast
```
