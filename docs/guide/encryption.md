# Encryption Guide

Atlex provides a comprehensive encryption system for protecting sensitive data at rest. This guide covers everything you need to know about encrypting and decrypting data, managing encryption keys, and handling key rotation.

## Introduction

The encryption system in Atlex uses industry-standard algorithms (AES-256-GCM) to protect sensitive information. All encrypted data includes authentication tags to prevent tampering, and the system supports key rotation for updating your encryption keys without losing access to previously encrypted data.

Key features include:

- **AES-256-GCM Encryption**: Industry-standard authenticated encryption
- **Automatic Serialization**: Encrypt objects and complex data structures
- **Key Rotation**: Support for multiple active keys
- **Multiple Key Formats**: Raw bytes or base64-encoded keys
- **Exception Handling**: Clear error types for encrypted and decrypted operations
- **Payload Integrity**: Built-in authentication to detect tampering

## Configuration

Configure encryption in your `config/app.ts` file:

```typescript
export default {
  // Application encryption key
  key: process.env.APP_KEY || 'base64:' + Buffer.from('your-32-byte-key').toString('base64'),

  // Encryption cipher
  cipher: 'AES-256-GCM',

  // Previous keys for decryption during rotation
  previousKeys: [
    'base64:previousKeyBase64String',
    // Add older keys here for backwards compatibility
  ],
}
```

### Key Format

Encryption keys should be 32 bytes (256 bits) for AES-256. Keys can be provided in two formats:

**Raw Key** (32 bytes):

```typescript
key: Buffer.from('exactly-32-bytes-of-random-data')
```

**Base64-Encoded Key** (with prefix):

```typescript
key: 'base64:' + Buffer.from('exactly-32-bytes-of-random-data').toString('base64')
```

## Key Generation

Generate strong encryption keys using the static helper:

```typescript
import { Encrypter } from '@atlex/encryption'

// Generate a key
const key = Encrypter.generateKey()
// Returns: Buffer of 32 random bytes

// Generate and format for .env
const encodedKey = 'base64:' + Encrypter.generateKey().toString('base64')
console.log(`APP_KEY=${encodedKey}`)

// Verify supported key length
const supported = Encrypter.supportedKeyLength('AES-256-GCM')
console.log(`AES-256-GCM requires ${supported} byte key`)
```

Store the generated key in your `.env` file:

```bash
APP_KEY=base64:abc123...xyz789==
```

## Encrypting Values

The `encrypt()` method returns an encrypted payload that can be stored safely in your database or files.

### Simple String Encryption

```typescript
import { Encrypter } from '@atlex/encryption'

export default {
  async storeApiKey({ encrypter, request }: Context) {
    const apiKey = request.input('api_key')

    // Encrypt the string
    const encrypted = encrypter.encrypt(apiKey)

    // Store in database
    const credential = await Credential.create({
      name: request.input('name'),
      value: encrypted,
    })

    return { message: 'API key stored securely' }
  },
}
```

### Encrypting Objects

Encrypt complex data structures with automatic serialization:

```typescript
export default {
  async storeUserSettings({ encrypter, auth }: Context) {
    const settings = {
      theme: 'dark',
      notifications: true,
      language: 'en',
      timezone: 'America/New_York',
      customPreferences: {
        compactView: true,
        autoSave: false,
      },
    }

    // Encrypt the entire object
    const encrypted = encrypter.encryptObject(settings)

    const user = auth.user()
    user.settings = encrypted
    await user.save()

    return { message: 'Settings saved securely' }
  },
}
```

### Encrypting Strings with Encoding

Use `encryptString()` for consistent string handling:

```typescript
export default {
  async storeSensitiveData({ encrypter, request }: Context) {
    const password = request.input('password')
    const ssn = request.input('ssn')

    // Both work similarly to encrypt()
    const encryptedPassword = encrypter.encryptString(password)
    const encryptedSSN = encrypter.encryptString(ssn)

    const record = await SensitiveData.create({
      encrypted_password: encryptedPassword,
      encrypted_ssn: encryptedSSN,
    })

    return { id: record.id }
  },
}
```

### Storing Encrypted Data

Encrypted payloads are base64-encoded strings safe for storage:

```typescript
export default {
  async handlePaymentInfo({ encrypter, request }: Context) {
    const cardNumber = request.input('card_number')

    const encrypted = encrypter.encrypt(cardNumber)

    // encrypted is a base64 string ready for storage
    const payment = await PaymentMethod.create({
      user_id: auth.user().id,
      encrypted_card: encrypted,
      last_four: cardNumber.slice(-4),
    })

    return { message: 'Payment method saved' }
  },
}
```

## Decrypting Values

Decrypt previously encrypted data. Decryption automatically verifies the encryption tag for authenticity.

### Decrypting Strings

```typescript
import { Encrypter } from '@atlex/encryption'

export default {
  async retrieveApiKey({ encrypter, request }: Context) {
    const credential = await Credential.find(request.param('id'))

    try {
      // Decrypt the string
      const apiKey = encrypter.decrypt(credential.value)

      return { apiKey }
    } catch (error) {
      if (error instanceof DecryptException) {
        throw new Exception('Failed to decrypt: invalid or tampered data')
      }

      throw error
    }
  },

  async useApiKey({ encrypter, request }: Context) {
    const credential = await Credential.find(request.param('id'))

    // Use decryptString for explicit string type
    const apiKey = encrypter.decryptString(credential.value)

    // Make API call with decrypted key
    const response = await fetch('https://api.example.com/data', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    return response.json()
  },
}
```

### Decrypting Objects

Decrypt and automatically deserialize objects:

```typescript
export default {
  async getUserSettings({ encrypter, auth }: Context) {
    const user = auth.user()

    try {
      // Decrypt and deserialize the object
      const settings = encrypter.decryptObject(user.settings)

      return { settings }
    } catch (error) {
      if (error instanceof DecryptException) {
        // Handle corrupted or tampered data
        return { settings: getDefaultSettings() }
      }

      throw error
    }
  },

  async applyUserPreferences({ encrypter, auth }: Context) {
    const user = auth.user()
    const settings = encrypter.decryptObject(user.settings)

    // Use decrypted settings
    return {
      theme: settings.theme,
      language: settings.language,
      timezone: settings.timezone,
    }
  },
}
```

## Error Handling

The encryption system throws specific exceptions for different failure scenarios.

### DecryptException

Thrown when decryption fails (invalid key, corrupted data, or tampering detected):

```typescript
import { DecryptException } from '@atlex/encryption'

export default {
  async safeDecode({ encrypter, request }: Context) {
    const encrypted = request.input('data')

    try {
      const decrypted = encrypter.decrypt(encrypted)
      return { value: decrypted }
    } catch (error) {
      if (error instanceof DecryptException) {
        // Log security incident
        console.error('Decryption failed - possible tampering', {
          timestamp: new Date(),
          userAgent: request.header('user-agent'),
        })

        throw new SecurityException('Invalid encrypted data')
      }

      throw error
    }
  },
}
```

### MissingAppKeyException

Thrown when the encryption key is not configured:

```typescript
import { MissingAppKeyException } from '@atlex/encryption'

export default {
  async encrypt({ encrypter, request }: Context) {
    try {
      const encrypted = encrypter.encrypt(request.input('value'))
      return { encrypted }
    } catch (error) {
      if (error instanceof MissingAppKeyException) {
        console.error('APP_KEY not configured in environment')
        throw new ConfigurationException('Encryption key not configured')
      }

      throw error
    }
  },
}
```

## Key Rotation

Support decryption with multiple keys during key rotation.

### Setting Up Key Rotation

Update your config to include previous keys:

```typescript
// config/app.ts
export default {
  key: process.env.APP_KEY, // Current key

  previousKeys: [
    'base64:oldKeyFromLastYear', // Decryption falls back to previous keys
    'base64:oldKeyFromTwoYearsAgo',
    // Add keys in order of most recent first
  ],
}
```

### Automatic Fallback Decryption

When decrypting, Atlex automatically tries previous keys if the current key fails:

```typescript
export default {
  async retrieveOldEncryptedData({ encrypter }: Context) {
    // This was encrypted with an older key
    const oldData = await OldCredential.first()

    // Decryption automatically tries:
    // 1. Current APP_KEY
    // 2. First key in previousKeys
    // 3. Second key in previousKeys
    // ... etc
    const decrypted = encrypter.decrypt(oldData.value)

    return { value: decrypted }
  },
}
```

### Re-encrypting Data with New Key

When rotating keys, re-encrypt old data with the new key:

```typescript
export default {
  async rotateEncryptionKeys({ encrypter, database }: Context) {
    // Get all encrypted records
    const credentials = await Credential.all()

    for (const credential of credentials) {
      try {
        // Decrypt with old key (automatic fallback)
        const plaintext = encrypter.decrypt(credential.value)

        // Re-encrypt with current key
        const reencrypted = encrypter.encrypt(plaintext)

        credential.value = reencrypted
        await credential.save()
      } catch (error) {
        console.error(`Failed to rotate key for credential ${credential.id}`)
      }
    }

    return { message: 'Key rotation complete' }
  },
}
```

## Advanced Usage

### Custom Encryption Keys

Work with specific keys directly:

```typescript
export default {
  async encryptWithSpecificKey({ encrypter, request }: Context) {
    const data = request.input('data')

    // Get all available keys
    const keys = encrypter.getAllKeys()
    console.log(`Using ${keys.length} available keys`)

    // Encrypt with current key
    const encrypted = encrypter.encrypt(data)

    // Get current key
    const currentKey = encrypter.getKey()
    console.log(`Current key length: ${currentKey.length} bytes`)

    return { encrypted }
  },
}
```

### Encrypting File Contents

Encrypt file data:

```typescript
import * as fs from 'fs/promises'

export default {
  async encryptFile({ encrypter, request }: Context) {
    const filePath = request.input('file_path')

    // Read file
    const fileContent = await fs.readFile(filePath, 'utf8')

    // Encrypt content
    const encrypted = encrypter.encrypt(fileContent)

    // Store encrypted content
    await fs.writeFile(filePath + '.encrypted', encrypted, 'utf8')

    return { message: 'File encrypted' }
  },

  async decryptFile({ encrypter, request }: Context) {
    const encryptedPath = request.input('file_path')

    // Read encrypted content
    const encrypted = await fs.readFile(encryptedPath, 'utf8')

    // Decrypt
    const content = encrypter.decrypt(encrypted)

    // Write decrypted content
    await fs.writeFile(encryptedPath.replace('.encrypted', ''), content, 'utf8')

    return { message: 'File decrypted' }
  },
}
```

### Encrypting Database Records

Middleware to automatically encrypt/decrypt specific fields:

```typescript
// app/Models/User.ts
import { Model } from '@atlex/orm'

export class User extends Model {
  protected casts = {
    email: 'string',
    encrypted_phone: 'string',
    encrypted_ssn: 'string',
  }

  protected hidden = ['encrypted_phone', 'encrypted_ssn']

  // Accessors for decryption
  getPhoneAttribute() {
    if (!this.encrypted_phone) return null
    return app.make(Encrypter).decrypt(this.encrypted_phone)
  }

  setPhoneAttribute(value: string) {
    this.encrypted_phone = app.make(Encrypter).encrypt(value)
  }

  getSsnAttribute() {
    if (!this.encrypted_ssn) return null
    return app.make(Encrypter).decrypt(this.encrypted_ssn)
  }

  setSsnAttribute(value: string) {
    this.encrypted_ssn = app.make(Encrypter).encrypt(value)
  }
}
```

Usage:

```typescript
export default {
  async storeUser({ request }: Context) {
    // Automatically encrypted via setter
    const user = await User.create({
      email: request.input('email'),
      phone: request.input('phone'),
      ssn: request.input('ssn'),
    })

    return { user }
  },

  async getUser({ request }: Context) {
    const user = await User.find(request.param('id'))

    // Automatically decrypted via getter
    return {
      email: user.email,
      phone: user.phone, // Decrypted automatically
      ssn: user.ssn, // Decrypted automatically
    }
  },
}
```

## API Reference

### Encrypter

```typescript
// Encrypt a value (string or object)
encrypt(value: string | object): string

// Decrypt a value
decrypt(payload: string): string

// Encrypt a string explicitly
encryptString(value: string): string

// Decrypt to string
decryptString(payload: string): string

// Encrypt an object (serialized to JSON)
encryptObject(value: object): string

// Decrypt to object (parsed from JSON)
decryptObject(payload: string): object

// Get current encryption key
getKey(): Buffer

// Get all available keys (current + previous)
getAllKeys(): Buffer[]

// Generate a new encryption key
static generateKey(): Buffer

// Get supported key length for cipher
static supportedKeyLength(cipher: string): number
```

### Exceptions

```typescript
// Thrown when decryption fails
class DecryptException extends Exception {
  message: string
}

// Thrown when encryption key is missing
class MissingAppKeyException extends Exception {
  message: string
}
```

## Security Best Practices

1. **Never log encrypted data**: Even encrypted values shouldn't be logged, as the format itself can leak information.

2. **Keep keys separate**: Store encryption keys in environment variables, not in version control.

3. **Use strong keys**: Always use `Encrypter.generateKey()` to create cryptographically strong keys.

4. **Rotate keys regularly**: Update your encryption key periodically and maintain previous keys for decryption.

5. **Verify authenticity**: The AES-256-GCM algorithm includes authentication, so tampering is detected automatically.

6. **Handle decryption errors**: Always catch `DecryptException` and handle gracefully. Don't expose error details to users.

7. **Encrypt sensitive data**: Use encryption for PII, financial data, API keys, and any other sensitive information.

8. **Test key rotation**: Verify that your key rotation process works before deploying to production.

## Testing

Test encryption and decryption in your test suite:

```typescript
import { test } from '@atlex/testing'
import { Encrypter } from '@atlex/encryption'

describe('Encryption', () => {
  test('can encrypt and decrypt string', () => {
    const encrypter = app.make(Encrypter)
    const original = 'sensitive-data'

    const encrypted = encrypter.encrypt(original)
    const decrypted = encrypter.decrypt(encrypted)

    expect(decrypted).toBe(original)
    expect(encrypted).not.toBe(original)
  })

  test('can encrypt and decrypt objects', () => {
    const encrypter = app.make(Encrypter)
    const original = { userId: 123, role: 'admin' }

    const encrypted = encrypter.encryptObject(original)
    const decrypted = encrypter.decryptObject(encrypted)

    expect(decrypted).toEqual(original)
  })

  test('detects tampering', () => {
    const encrypter = app.make(Encrypter)
    const encrypted = encrypter.encrypt('data')

    // Tamper with encrypted data
    const tampered = encrypted.slice(0, -5) + 'xxxxx'

    expect(() => {
      encrypter.decrypt(tampered)
    }).toThrow(DecryptException)
  })

  test('fails with invalid key', () => {
    const encrypter = app.make(Encrypter)
    const encrypted = encrypter.encrypt('data')

    // Create new encrypter with different key
    const wrongEncrypter = new Encrypter(Encrypter.generateKey())

    expect(() => {
      wrongEncrypter.decrypt(encrypted)
    }).toThrow(DecryptException)
  })

  test('supports key rotation', () => {
    const oldKey = Encrypter.generateKey()
    const oldEncrypter = new Encrypter(oldKey)
    const encrypted = oldEncrypter.encrypt('data')

    // Simulate rotation: old key becomes previous key
    const newKey = Encrypter.generateKey()
    const newEncrypter = new Encrypter(newKey, [oldKey])

    // Should decrypt with fallback to old key
    const decrypted = newEncrypter.decrypt(encrypted)
    expect(decrypted).toBe('data')
  })
})
```

This comprehensive guide covers all aspects of encryption in Atlex. For maximum security, always use the provided encryption utilities for sensitive data and follow the security best practices outlined above.
