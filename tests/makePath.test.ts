import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { AtlexCliError } from '../src/errors/AtlexCliError.js'
import { joinMakeOutputRelativePath, parseQualifiedMakeName } from '../src/utils/makePath.js'
import { createTableMigrationNameForModel } from '../src/utils/naming.js'

describe('parseQualifiedMakeName', () => {
  it('parses nested generator paths', () => {
    expect(parseQualifiedMakeName('Test/TestController')).toEqual({
      subdirectories: ['Test'],
      leafRaw: 'TestController',
    })
    expect(parseQualifiedMakeName('API/V1/Post')).toEqual({
      subdirectories: ['Api', 'V1'],
      leafRaw: 'Post',
    })
  })

  it('parses a single segment', () => {
    expect(parseQualifiedMakeName('UserController')).toEqual({
      subdirectories: [],
      leafRaw: 'UserController',
    })
  })

  it('normalizes backslashes', () => {
    expect(parseQualifiedMakeName('Admin\\User')).toEqual({
      subdirectories: ['Admin'],
      leafRaw: 'User',
    })
  })

  it('rejects path traversal', () => {
    expect(() => parseQualifiedMakeName('foo/../Bar')).toThrow(AtlexCliError)
  })
})

describe('joinMakeOutputRelativePath', () => {
  it('joins base, subdirs, and file', () => {
    expect(joinMakeOutputRelativePath('app/Http/Controllers', ['Test'], 'TestController.js')).toBe(
      path.join('app', 'Http', 'Controllers', 'Test', 'TestController.js'),
    )
  })
})

describe('createTableMigrationNameForModel', () => {
  it('pluralizes model name to table stem', () => {
    expect(createTableMigrationNameForModel('User')).toBe('create_users_table')
    expect(createTableMigrationNameForModel('Post')).toBe('create_posts_table')
  })
})
