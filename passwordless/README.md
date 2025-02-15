# End-to-end Example - Frontend

This is a sample React application that you can run to play around with this library. It allows you to sign in with magic links and FIDO2 (Face ID / Touch).

```sh
nerdctl build . --build-context ttyd-git=https://github.com/tsl0922/ttyd.git --target ttyd-frontend -t toolchain-cdk-ttyd-frontend
nerdctl run -it --rm -p 9000:9000 toolchain-cdk-ttyd-frontend
nerdctl run -d -p 9000:9000 toolchain-cdk-ttyd-frontend
```
