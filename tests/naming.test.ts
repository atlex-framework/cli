import { describe, expect, it } from 'vitest'

import {
  formatMigrationTimestamp,
  stripTrailingSuffix,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
} from '../src/utils/naming.js'

describe('toPascalCase', () => {
  it('converts snake_case per spec example', () => {
    expect(toPascalCase('user_profile')).toBe('UserProfile')
  })

  it('normalizes camelCase and PascalCase', () => {
    expect(toPascalCase('userProfile')).toBe('UserProfile')
    expect(toPascalCase('UserProfile')).toBe('UserProfile')
  })

  it('returns empty string for blank input', () => {
    expect(toPascalCase('')).toBe('')
    expect(toPascalCase('   ')).toBe('')
  })
})

describe('toCamelCase', () => {
  it('lowercases the first segment', () => {
    expect(toCamelCase('user_profile')).toBe('userProfile')
    expect(toCamelCase('User')).toBe('user')
  })
})

describe('toSnakeCase', () => {
  it('flattens PascalCase', () => {
    expect(toSnakeCase('UserProfile')).toBe('user_profile')
  })

  it('keeps snake input stable', () => {
    expect(toSnakeCase('create_users_table')).toBe('create_users_table')
  })
})

describe('toKebabCase', () => {
  it('joins with hyphens', () => {
    expect(toKebabCase('UserProfile')).toBe('user-profile')
  })
})

describe('stripTrailingSuffix', () => {
  it('removes a trailing suffix once when safe', () => {
    expect(stripTrailingSuffix('UserController', 'Controller')).toBe('User')
  })

  it('does not strip down to empty', () => {
    expect(stripTrailingSuffix('Controller', 'Controller')).toBe('Controller')
  })
})

describe('formatMigrationTimestamp', () => {
  it('formats UTC migration timestamp segments', () => {
    const fixed = new Date(Date.UTC(2026, 3, 5, 14, 30, 7))
    expect(formatMigrationTimestamp(fixed)).toBe('2026_04_05_143007')
  })
})
