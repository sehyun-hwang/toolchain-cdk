#!/bin/sh

ttyd -i /run/ttyd.sock -U nginx:nginx fish &
python -m pypm init

sleep 1
echo '' | nc localhost 8080
