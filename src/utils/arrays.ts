export function hasUniqueEntries(items: Array<any>, field: string): boolean {
  const uniqueFields = new Set();

  const duplicates = items.filter((item) => {
    if (!item[field]) {
      throw new Error(`unknown field:${field} on array item`);
    }

    if (uniqueFields.has(item[field])) {
      return true;
    }
    uniqueFields.add(item[field]);
    return false;
  });

  return duplicates.length === 0;
}
