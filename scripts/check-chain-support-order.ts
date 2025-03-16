import * as chainSupport from '../data/chain-support.json';

function isArrayAlphabeticallyOrdered(arr: string[]): boolean {
  const sortedArr = [...arr].sort();
  return arr.every((value, index) => value === sortedArr[index]);
}

function main(): void {
  const logs: string[] = [];

  for (const [arrayName, array] of Object.entries(chainSupport)) {
    if (Array.isArray(array) && !isArrayAlphabeticallyOrdered(array as string[])) {
      logs.push(`Error: ${arrayName} is not alphabetically ordered`);
    }
  }

  if (logs.length > 0) {
    // eslint-disable-next-line no-console
    logs.forEach((log) => console.error(log));
    process.exit(1);
  }

  process.exit(0);
}

main();
