{ lib, buildInputs, ... }:

lib.package {
  pname = "myPackage";
  version = "1.0";
  src = ./.;
  isLibrary = false;

  meta = with lib; {
    description = "My custom package";
    license = licenses.mit;
  };
}