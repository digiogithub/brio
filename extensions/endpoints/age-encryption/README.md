# age-encryption endpoint

API routes for fields encrypted with [age](https://age-encryption.org) through the `age-encrypted` interface. The
companion hook extension (`extensions/hooks/age-encryption`) encrypts those fields on create and update.

## Configuration

| Variable                  | Purpose                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `AGE_RECIPIENT`           | Public key (`age1...`) used by the hook to encrypt.                            |
| `AGE_IDENTITY`            | Private key (`AGE-SECRET-KEY-1...`) used by this endpoint to decrypt.          |
| `AGE_DECRYPT_ALLOW_ROLES` | Comma-separated role ids allowed to decrypt, besides admins. Empty by default. |

## Routes

All routes live under `/age-encryption`.

| Route                      | Access                 | Description                                                     |
| -------------------------- | ---------------------- | --------------------------------------------------------------- |
| `GET /status`              | admin                  | Whether the keys are configured. Never returns the private key. |
| `POST /generate-keypair`   | admin                  | Generates a keypair and returns it once. Nothing is stored.     |
| `POST /delete-private-key` | admin                  | Removes key markers left in public settings by old versions.    |
| `POST /decrypt`            | admin or allowed roles | Decrypts values, see below.                                     |

### `POST /decrypt`

Reading items always returns the stored ciphertext. Decryption is explicit and takes one of three bodies:

```jsonc
// One value. 400 if it cannot be decrypted.
{ "ciphertext": "-----BEGIN AGE ENCRYPTED FILE-----..." }
// -> { "plaintext": "..." }

// Up to 500 values. The answer keeps the order; values that fail are null.
{ "ciphertexts": ["-----BEGIN AGE ENCRYPTED FILE-----...", "..."] }
// -> { "plaintexts": ["...", null], "failed": 1 }

// Up to 500 items of a collection. `fields` is optional and defaults to every age-encrypted field.
{ "collection": "members", "keys": [1, 2, 3], "fields": ["national_id"] }
// -> { "data": [{ "id": 1, "national_id": "..." }], "failed": 0 }
```

In collection mode the items are read with the permissions of the requesting user: items and fields the user cannot read
are left out of the answer. System collections are refused.

Batch and collection requests are logged (user, number of values, failures), never the values themselves.

## Development

`src/index.ts` is the source. `dist/index.js` is the bundle the API loads and is committed, so the extension works when
its folder is mounted into a container without an install step. After changing the source:

```sh
bun run build
bun run test
```
