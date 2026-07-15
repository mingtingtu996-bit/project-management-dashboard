import { describe, expect, it } from 'vitest'
import {
  __createWizardScopeNodeForTest,
  __syncWizardScopeNodeIdCounterForTest,
} from '../Step3EngineeringScopeScale'

describe('Step3EngineeringScopeScale node id generation', () => {
  it('advances the node id counter from restored draft trees before creating new nodes', () => {
    __syncWizardScopeNodeIdCounterForTest([
      {
        id: 'node_20',
        type: 'building',
        name: 'Tower A',
        parentId: null,
        expanded: true,
        metadata: {},
        children: [
          {
            id: 'node_21',
            type: 'floor',
            name: 'L1',
            parentId: 'node_20',
            expanded: true,
            metadata: {},
            children: [],
          },
        ],
      },
    ])

    const next = __createWizardScopeNodeForTest('floor', 'node_20', 'L2')

    expect(next.id).toBe('node_22')
  })

  it('never moves the counter backwards when an older draft snapshot arrives later', () => {
    __syncWizardScopeNodeIdCounterForTest([{
      id: 'node_30',
      type: 'building',
      name: 'Tower B',
      parentId: null,
      expanded: true,
      metadata: {},
      children: [],
    }])
    __syncWizardScopeNodeIdCounterForTest([{
      id: 'node_5',
      type: 'building',
      name: 'Tower C',
      parentId: null,
      expanded: true,
      metadata: {},
      children: [],
    }])

    const next = __createWizardScopeNodeForTest('building', null, 'Tower D')

    expect(next.id).toBe('node_31')
  })
})
