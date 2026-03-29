import { managementProcedures } from 'extension-bridge/procedures/management';

export const pedestalBridgeRouter = {
  extensions: managementProcedures,
};

export type PedestalBridgeRouter = typeof pedestalBridgeRouter;
