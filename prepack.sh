#!/usr/bin/env bash
rm -r artifacts
rm -r cache
rm -r dist
rm -r node_modules
rm -r typechain-types
pnpm i
pnpm build
cp -r contracts/access access
cp -r contracts/api3-server-v1 api3-server-v1
cp -r contracts/utils utils
cp -r contracts/vendor vendor
