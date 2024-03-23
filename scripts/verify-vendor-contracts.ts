import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { glob } from 'glob';

async function main() {
  const vendors = [
    {
      path: join('@openzeppelin', 'contracts@4.8.2'),
      tarballUrl: 'https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.8.2.tgz',
      packageContractsPath: '',
    },
    {
      path: join('@openzeppelin', 'contracts@4.9.5'),
      tarballUrl: 'https://registry.npmjs.org/@openzeppelin/contracts/-/contracts-4.9.5.tgz',
      packageContractsPath: '',
    },
  ];
  for (const vendor of vendors) {
    // eslint-disable-next-line no-console
    console.log(
      `Checking if contracts in ${vendor.path} are identical to the ones in the package at ${vendor.tarballUrl}`
    );
    // First creates the directory untarred-package, then downloads and untars
    // the package in untarred-package, stripping one layer to ignore the tar name
    execSync(
      `mkdir -p untarred-package | wget -qO- ${vendor.tarballUrl} | tar xvz -C untarred-package --strip-components=1`
    );
    const filePaths = await glob(`./contracts/vendor/${vendor.path}/**/*.sol`);
    for (const filePath of filePaths) {
      const vendorContract = readFileSync(filePath).toString();
      const packageContract = readFileSync(
        join(
          'untarred-package',
          vendor.packageContractsPath,
          relative(join('contracts', 'vendor', vendor.path), join(filePath))
        )
      ).toString();
      if (vendorContract === packageContract) {
        // eslint-disable-next-line no-console
        console.log(`${basename(filePath)} is identical!`);
      } else {
        throw new Error(`${basename(filePath)} is NOT identical!`);
      }
    }
    rmSync('untarred-package', { recursive: true, force: true });
  }
}

/* eslint-disable */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
