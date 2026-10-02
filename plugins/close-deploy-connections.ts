import type { TaskOverrideActionFunction } from 'hardhat/types/tasks';

import { openConnections } from './open-connections.js';

// hardhat-deploy's `deploy` task opens a connection and never closes it, and Hardhat 3 only runs the
// closeConnection hooks on an explicit close. keycard-hardhat-provider disconnects the card in that
// hook, so without this the card is held until the process exits.
const action: TaskOverrideActionFunction = async (args, _hre, runSuper) => {
  const openBefore = new Set(openConnections);

  try {
    return await runSuper(args);
  } finally {
    // Closing a connection removes it from the set, which a Set tolerates mid-iteration.
    for (const connection of openConnections) {
      if (!openBefore.has(connection)) {
        await connection.close();
      }
    }
  }
};

// eslint-disable-next-line import/no-default-export
export default action;
