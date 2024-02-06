// The compiler appends by default the IPFS hash of the metadata file to the
// end of the bytecode (the last 53 bytes/106 hexadecimals).
// https://docs.soliditylang.org/en/v0.8.17/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode
// To keep the same deterministic deployment addresses, this hash needs to be
// overwritten with the old value.

import * as fs from 'node:fs';

import { glob } from 'glob';

const contractMetadataHashes = {
  AccessControlRegistry: {
    oldMetadataHash:
      'a2646970667358221220ae4f3421aaad5b1af12510ac03d7ec2649209de4471e48601a849e44cc2f1d5864736f6c63430008110033',
    newMetadataHash:
      'a26469706673582212200f9ab38cf6b5a47f53951a03fff726280b26ef209c022dab89e1567ff6f9501664736f6c63430008110033',
  },
  Api3ServerV1: {
    oldMetadataHash:
      'a2646970667358221220693313c61a998d79d0e9b250367bd14ac439bd3d1d1f36bf50317fc99059456d64736f6c63430008110033',
    newMetadataHash:
      'a26469706673582212207c03c148b5b24aa97fa9ff678f877150b1d6924841f1b68de5e72b4a296ba91964736f6c63430008110033',
  },
  OwnableCallForwarder: {
    oldMetadataHash:
      'a26469706673582212209bc00d30ca9753335445fb76197730f010383979aa0fd4b393e2e8826680071064736f6c63430008110033',
    newMetadataHash:
      'a2646970667358221220146ccade827aa0561f393ba58743fa1f6d62f1ce6039d927c5515d35d5d47cde64736f6c63430008110033',
  },
  ProxyFactory: {
    oldMetadataHash:
      'a2646970667358221220c65d86e8fe1882ee9717fe8fadf286e2319482a7213942b09ed85c68e3cb244164736f6c63430008110033',
    newMetadataHash:
      'a2646970667358221220e3758767147d00e97a8688a088298a0310b4f198de10c4a1be3b6777fca99b2464736f6c63430008110033',
  },
};

async function main() {
  for (const [contractName, { oldMetadataHash, newMetadataHash }] of Object.entries(contractMetadataHashes)) {
    const [artifactFilePath] = await glob(`./artifacts/contracts/**/${contractName}.json`);
    const artifact = fs.readFileSync(artifactFilePath!, 'utf8');
    fs.writeFileSync(artifactFilePath!, artifact.replaceAll(newMetadataHash, oldMetadataHash));
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
