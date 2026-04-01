import { createClient } from 'extension-bridge'
import type { DefaultRouter } from 'extension-bridge'

export const bridge = createClient<DefaultRouter>({ debug: true })
