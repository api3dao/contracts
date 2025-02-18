import { toUpperSnakeCase } from './strings';

describe(toUpperSnakeCase.name, () => {
  it('converts simple words', () => {
    const result = toUpperSnakeCase('hello world');
    expect(result).toBe('HELLO_WORLD');
  });

  it('keeps numbers in the string', () => {
    const result = toUpperSnakeCase('hello world 4');
    expect(result).toBe('HELLO_WORLD_4');
  });

  it('trims leading and trailing whitespaces', () => {
    const result = toUpperSnakeCase('  hello world  ');
    expect(result).toBe('HELLO_WORLD');
  });

  it('converts special characters to underscores', () => {
    const result = toUpperSnakeCase('hello,world!');
    expect(result).toBe('HELLO_WORLD');
  });

  it('converts special characters and spaces to underscores', () => {
    const result = toUpperSnakeCase('hello, world!');
    expect(result).toBe('HELLO_WORLD');
  });

  it('converts multiple spaces to single underscores', () => {
    const result = toUpperSnakeCase('hello  world');
    expect(result).toBe('HELLO_WORLD');
  });

  it('returns an empty string when given an empty string', () => {
    const result = toUpperSnakeCase('');
    expect(result).toBe('');
  });

  it('converts mixed case strings', () => {
    const result = toUpperSnakeCase('Hello World');
    expect(result).toBe('HELLO_WORLD');
  });
});
