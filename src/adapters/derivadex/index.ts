import type { Adapter } from '@lib/adapter'

import * as ethereum from './ethereum'

const adapter: Adapter = {
  id: 'derivadex',
  ethereum: ethereum,
}

export default adapter
