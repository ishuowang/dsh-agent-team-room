import { describe, expect, it } from 'vitest'
import {
  ROOM_TEMPLATE_VERSION,
  getRoomTemplate,
  listRoomTemplates,
} from '../src/templates.js'

describe('built-in Room scenario registry', () => {
  it('ships seven stable, unique, complete templates in presentation order', () => {
    const templates = listRoomTemplates()

    expect(templates.map(template => template.id)).toEqual([
      'opc',
      'deep-research',
      'software-delivery',
      'incident-response',
      'customer-support',
      'content-campaign',
      'plan-execute-review',
    ])
    expect(new Set(templates.map(template => template.id)).size).toBe(templates.length)
    for (const template of templates) {
      expect(template.version).toBe(ROOM_TEMPLATE_VERSION)
      expect(template.description.trim().length).toBeGreaterThan(20)
      expect(template.defaultObjective.trim().length).toBeGreaterThan(20)
      expect(template.roles.length).toBeGreaterThanOrEqual(5)
      expect(template.approvalGates.length).toBeGreaterThan(0)
      expect(new Set(template.roles.map(role => role.id)).size).toBe(template.roles.length)
      for (const role of template.roles) {
        expect(role.name.trim()).not.toBe('')
        expect(role.role.trim()).not.toBe('')
        expect(role.systemPrompt.trim().length).toBeGreaterThan(40)
      }
    }
  })

  it('makes OPC a founder-gated company structure with every requested function', () => {
    const opc = getRoomTemplate('opc')

    expect(opc).toMatchObject({
      experimental: true,
      category: 'business',
      orchestration: 'hierarchical',
    })
    expect(opc.roles.map(role => role.id)).toEqual([
      'chief-of-staff',
      'finance',
      'legal',
      'operations',
      'product-rd',
      'growth-sales',
      'customer-success',
    ])
    expect(opc.approvalGates.join(' ')).toMatch(/human Founder.*spending/iu)
    expect(opc.approvalGates.join(' ')).toMatch(/contracts.*legal/iu)
    expect(opc.approvalGates.join(' ')).toMatch(/production releases/iu)
  })

  it('returns detached copies and never exposes mutable canonical state', () => {
    const first = listRoomTemplates()
    first[0]!.name = 'mutated by caller'
    first[0]!.roles[0]!.name = 'mutated role'
    first[0]!.approvalGates.length = 0

    const again = getRoomTemplate('opc')
    expect(again.name).toBe('One-Person Company')
    expect(again.roles[0]!.name).toBe('Chief of Staff')
    expect(again.approvalGates.length).toBeGreaterThan(0)
  })

  it('trims ids and fails clearly for unknown or empty ids', () => {
    expect(getRoomTemplate('  deep-research  ').id).toBe('deep-research')
    expect(() => getRoomTemplate('missing')).toThrow('unknown template missing')
    expect(() => getRoomTemplate('  ')).toThrow('unknown template <empty>')
  })
})
