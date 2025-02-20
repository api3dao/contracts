import { deepEqual } from './deep-equal';

describe('deepEqual', () => {
  it('primitive values', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);

    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(true, 1)).toBe(false);
  });

  it('arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);

    expect(deepEqual([1, 2, 3], [1, 2, 3, 4])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
  });

  it('objects', () => {
    const obj1 = { a: 1, b: { c: 2, d: { e: 3 } } };
    const obj2 = { a: 1, b: { c: 2, d: { e: 3 } } };
    const obj3 = { a: 1, b: { c: 2, d: { e: 4 } } };

    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj3)).toBe(false);
  });

  it('objects with different key orders', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { b: 2, a: 1, c: 3 };

    expect(deepEqual(obj1, obj2)).toBe(true);
  });

  it('null and undefined values', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual({ a: null }, { a: null })).toBe(true);

    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual({ a: null }, { a: undefined })).toBe(false);
  });

  it('function values', () => {
    const func1 = (): void => {};
    const func2 = (): void => {};

    expect(deepEqual(func1, func1)).toBe(true);
    expect(deepEqual(func1, func2)).toBe(false);
  });
});
