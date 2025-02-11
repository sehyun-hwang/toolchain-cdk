```sh
nix run --extra-experimental-features 'nix-command flakes' home-manager -- switch --flake . --extra-experimental-features 'nix-command flakes'
```
