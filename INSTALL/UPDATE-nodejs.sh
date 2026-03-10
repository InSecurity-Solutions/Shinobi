#!/bin/bash
DIR=$(dirname $0)
bash $DIR/nodejs-ubuntu.sh
cd $DIR/../
npm i pm2@latest -g
rm -rf node_modules
npm i
