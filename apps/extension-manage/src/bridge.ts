import { createClient } from 'extension-bridge/client'
import type { managementProcedures } from 'extension-bridge/procedures/management'

// 与 pedestal-extension 保持结构一致，无需直接依赖私有包
type ExtensionManageRouter = {
  extensions: typeof managementProcedures
}

export const bridge = createClient<ExtensionManageRouter>({ debug: false })
