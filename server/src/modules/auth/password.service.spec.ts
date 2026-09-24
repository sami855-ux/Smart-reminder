import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id and verifies only the matching password', async () => {
    const hash = await service.hash('a-correct-long-password');

    expect(hash).toContain('$argon2id$');
    await expect(service.verify(hash, 'a-correct-long-password')).resolves.toBe(true);
    await expect(service.verify(hash, 'an-incorrect-password')).resolves.toBe(false);
  });
});
