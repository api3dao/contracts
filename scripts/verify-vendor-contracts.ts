import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

function main() {
  const vendors = [
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
    const dirents = readdirSync(join('contracts', 'vendor', vendor.path), {
      recursive: true,
      withFileTypes: true,
    }).filter((dirent) => dirent.name && extname(dirent.name) === '.sol');
    for (const dirent of dirents) {
      const vendorContract = readFileSync(join(dirent.path, dirent.name)).toString();
      const packageContract = readFileSync(
        join(
          'untarred-package',
          vendor.packageContractsPath,
          relative(join('contracts', 'vendor', vendor.path), join(dirent.path, dirent.name))
        )
      ).toString();
      if (vendorContract === packageContract) {
        // eslint-disable-next-line no-console
        console.log(`${dirent.name} is identical!`);
      } else {
        throw new Error(`${dirent.name} is NOT identical!`);
      }
    }
    rmSync('untarred-package', { recursive: true, force: true });
  }
}

main();
