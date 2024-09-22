import chainSupport from '../data/chain-support.json';

async function checkSortedList(list: string[]): Promise<void> {
  const sortedList = [...list].sort();
  if (JSON.stringify(list) !== JSON.stringify(sortedList)) {
    throw new Error(`List unsorted`);
  }
}

async function checkDuplicates(list: string[]): Promise<void> {
  const hasDuplicates = new Set(list).size !== list.length;
  if (hasDuplicates) {
    throw new Error(`Duplicates found`);
  }
}

async function main(fieldLists: Record<string, string[]>): Promise<void> {
  const errors: Error[] = [];
  for (const field in fieldLists) {
    const list = fieldLists[field];
    if (!list || list.length === 0) {
      errors.push(new Error(`Empty list found for field: ${field}`));
      continue;
    }

    const validations = [checkDuplicates, checkSortedList];
    await Promise.all(
      validations.map(async (validation) => {
        try {
          await validation(list);
        } catch (error) {
          errors.push(new Error(`${(error as Error).message} in field: ${field}`));
        }
      })
    );
  }
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Validation failed with the following error(s):\n${errors.join('\n')}`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}

/* eslint-disable */
main(chainSupport)
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
