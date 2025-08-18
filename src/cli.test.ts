import { execSync } from 'node:child_process';

import { goSync } from '@api3/promise-utils';

const CLI_EXECUTABLE = 'dist/src/cli.js';

type CommandArg = [string, string | number | boolean];

describe('cli tests', () => {
  const execCommand = (command: string, ...args: CommandArg[]) => {
    const quote = (val: string) => `"${val}"`;
    const formattedArgs = args
      .map(([c, a]) => {
        // if args is array then quote each elem and separate them with space
        if (Array.isArray(a)) return `${c} ${a.map((element) => quote(element)).join(' ')}`;
        // otherwise just quote each elem and separate them with space
        else return `${c} ${quote(String(a))}`;
      })
      .join(' ');
    const formattedCommand = `${command} ${formattedArgs}`;
    const goExecSync = goSync(() =>
      execSync(`node ${CLI_EXECUTABLE} ${formattedCommand}`, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
    if (!goExecSync.success) {
      // rethrow the output of the CLI
      throw new Error((goExecSync.error as any).reason.stderr.toString().trim());
    }

    const stdout = goExecSync.data?.toString().trim() || '';
    return stdout;
  };

  it('should compute dApp ID', () => {
    const output = execCommand('compute-dapp-id', ['--dapp-alias', 'lendle'], ['--chain-id', '5000']);
    expect(output).toMatch(
      'dApp alias: lendle\nchain: Mantle\n\n• dApp ID: 3006187377348428698321862179080566497381498372321749245241868771911713393091'
    );
  });

  it('should throw an error for an unknown chain id', () => {
    expect(() => {
      execCommand('compute-dapp-id', ['--dapp-alias', 'lendle'], ['--chain-id', '0']);
    }).toThrow('⚠️  Chain with ID 0 is not known');
  });

  it('should throw an error for an unknown dApp alias', () => {
    expect(() => {
      execCommand('compute-dapp-id', ['--dapp-alias', 'unsupported-dapp'], ['--chain-id', '5000']);
    }).toThrow('⚠️  Could not find any record for alias "unsupported-dapp"');
  });

  it('should throw an error for unsupported chain ID', () => {
    expect(() => {
      execCommand('compute-dapp-id', ['--dapp-alias', 'lendle'], ['--chain-id', '1']);
    }).toThrow('⚠️  dApp alias "lendle" is not available on chain "Ethereum"');
  });

  it('should return an invalid output if strict is false', () => {
    const output = execCommand(
      'compute-dapp-id',
      ['--dapp-alias', 'unsupported-dapp'],
      ['--chain-id', '0'],
      ['--strict', false]
    );
    expect(output).toMatch(
      'dApp alias: unsupported-dapp\nchain: 0\n\n• dApp ID: 113044575011858809962820051290270246401920929513853405225169263442003318378526'
    );
  });

  it('should match help output', () => {
    const output = execCommand('help');
    expect(output).toMatchSnapshot();
  });

  it('should throw an error for an unknown chain id while checking Api3ReaderProxyV1 address', () => {
    expect(() => {
      execCommand(
        'print-api3readerproxyv1-address',
        ['--dapp-alias', 'unsupported-dapp'],
        ['--chain-id', '0'],
        ['--dapi-name', 'ETH/USD']
      );
    }).toThrow('Chain with ID 0 is not known');
  });

  it('should throw an error for an unknown dApp alias while checking Api3ReaderProxyV1 address', () => {
    expect(() => {
      execCommand(
        'print-api3readerproxyv1-address',
        ['--dapp-alias', 'unsupported-dapp'],
        ['--chain-id', '5000'],
        ['--dapi-name', 'ETH/USD']
      );
    }).toThrow('⚠️ Could not find any record for alias "unsupported-dapp"');
  });

  it('should throw an error for an unsupported dApi name', () => {
    expect(() => {
      execCommand(
        'print-api3readerproxyv1-address',
        ['--dapp-alias', 'lendle'],
        ['--chain-id', '5000'],
        ['--dapi-name', 'UNSUPPORTED/USD']
      );
    }).toThrow(/⚠️ Attempted to read the feed and failed/);
  });

  it('should print-api3readerproxyv1-address', () => {
    const output = execCommand(
      'print-api3readerproxyv1-address',
      ['--dapp-alias', 'lendle'],
      ['--chain-id', '5000'],
      ['--dapi-name', 'ETH/USD']
    );
    expect(output).toMatchSnapshot();
  });
});
