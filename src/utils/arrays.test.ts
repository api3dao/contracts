import { hasUniqueEntries } from './arrays';

describe(hasUniqueEntries.name, () => {
  it('returns true for an empty array', () => {
    const items: any[] = [];
    expect(hasUniqueEntries(items, 'id')).toBe(true);
  });

  it('returns false for duplicates based on specified field', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 1, name: 'C' },
    ];
    expect(hasUniqueEntries(items, 'id')).toBe(false);
  });

  it('returns true if no duplicates based on specified field', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ];
    expect(hasUniqueEntries(items, 'id')).toBe(true);
  });

  it('returns true for an array with a single element', () => {
    const items = [{ id: 1, name: 'A' }];
    expect(hasUniqueEntries(items, 'id')).toBe(true);
  });

  it('throws an error for a non-existing field', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ];
    expect(() => hasUniqueEntries(items, 'nonExistingField')).toThrow('unknown field:nonExistingField on array item');
  });

  it('returns false for duplicates in non-primary field', () => {
    const items = [
      { id: 1, name: 'A' },
      { id: 2, name: 'A' },
    ];
    expect(hasUniqueEntries(items, 'name')).toBe(false);
  });

  it('throws an error given an array of primitives', () => {
    const items = [1, 2, 3, 1];
    expect(() => hasUniqueEntries(items as any, 'id')).toThrow('unknown field:id on array item');
  });

  it('throws an error given an array of different object structures', () => {
    const items = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, 3];
    expect(() => hasUniqueEntries(items, 'id')).toThrow('unknown field:id on array item');
  });
});
