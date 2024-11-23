# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template


```sh
aws ec2-instance-connect send-ssh-public-key \
    --instance-id i-0e2ee4154dd6f8e1a \
    --instance-os-user ec2-user \
    --ssh-public-key file:///root/.ssh/id_ed25519.pub

ssh ec2-user@172.31.47.159
```