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
