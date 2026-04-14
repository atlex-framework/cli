import { describe, expect, it } from 'vitest'

import { inferTableFromCreateMigration } from '../src/utils/projectLanguage.js'

describe('inferTableFromCreateMigration', () => {
  it('extracts table name from create_*_table migration names', () => {
    expect(inferTableFromCreateMigration('create_users_table')).toBe('users')
    expect(inferTableFromCreateMigration('create_user_profiles_table')).toBe('user_profiles')
  })

  it('returns null when pattern does not match', () => {
    expect(inferTableFromCreateMigration('add_email_to_users')).toBeNull()
    expect(inferTableFromCreateMigration('create_table')).toBeNull()
  })
})
