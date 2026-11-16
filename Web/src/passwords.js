import { DurableObject } from 'cloudflare:workers';
import { scryptSync } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };

export class AccountPasswords extends DurableObject {
  derive(password, salt) {
    return scryptSync(password, salt, 32, parameters).toString('hex');
  }
}
