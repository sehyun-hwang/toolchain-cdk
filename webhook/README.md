```sh
podman build . -t stress-webhook
podman kube play pod.yml

curl localhost:9000/hooks/whoami
curl 'localhost:9000/hooks/stress?time=1'
```