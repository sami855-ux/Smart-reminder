import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash, verify, type Options } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  version: 1, // Argon2 version 0x13
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} satisfies Options;

@Injectable()
export class PasswordService {
  private readonly dummyHash = hash(randomBytes(32), ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return verify(hash, password);
  }

  async consumeEquivalentWork(password: string): Promise<void> {
    await verify(await this.dummyHash, password);
  }
}
