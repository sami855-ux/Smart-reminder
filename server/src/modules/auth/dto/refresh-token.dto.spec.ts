import { validate } from 'class-validator';

import { RefreshTokenDto } from './refresh-token.dto.js';

async function validationErrors(refreshToken: string) {
  const dto = new RefreshTokenDto();
  dto.refreshToken = refreshToken;
  return validate(dto);
}

describe('RefreshTokenDto', () => {
  const entropy = 'a'.repeat(43);

  it('accepts account-bound and legacy opaque refresh tokens', async () => {
    await expect(
      validationErrors(`10000000-0000-4000-8000-000000000001.${entropy}`),
    ).resolves.toHaveLength(0);
    await expect(validationErrors(entropy)).resolves.toHaveLength(0);
  });

  it('rejects malformed refresh tokens', async () => {
    await expect(validationErrors(`invalid.${entropy}`)).resolves.not.toHaveLength(0);
  });
});
