```sh
docker build . -t stress
docker run -it --rm -p 9000:9000 stress
curl 'http://localhost:9000/hooks/stress?time=1'
```