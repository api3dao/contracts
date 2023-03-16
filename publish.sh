yarn && yarn build
rm -r v0.6
rm -r v0.7
rm -r v0.8
cp -r contracts/v0.6 v0.6
cp -r contracts/v0.7 v0.7
cp -r contracts/v0.8 v0.8
yarn version
yarn publish --access public
git push --follow-tags
