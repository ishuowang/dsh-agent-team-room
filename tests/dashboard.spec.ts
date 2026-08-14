import { describe, expect, it } from 'vitest'
import { isLoopbackAddress } from '../src/dashboard.js'

describe('dashboard network boundary', () => {
  it.each([
    '127.0.0.1',
    '127.42.0.9',
    '::1',
    '::ffff:127.0.0.1',
  ])('accepts loopback address %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true)
  })

  it.each([
    undefined,
    '0.0.0.0',
    '192.168.1.2',
    '8.8.8.8',
    '2001:db8::1',
  ])('rejects non-loopback address %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(false)
  })
})
