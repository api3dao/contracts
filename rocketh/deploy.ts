import { setupDeployScripts } from 'rocketh';

import { type Accounts, type Data, type Extensions, extensions } from './config.js';

const { deployScript } = setupDeployScripts<Extensions, Accounts, Data>(extensions);

export * as artifacts from '../generated/artifacts/index.js';
export { deployScript };
