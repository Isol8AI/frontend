/**
 * Type declarations for argon2-browser.
 */

declare module 'argon2-browser' {
  export interface Argon2HashOptions {
    pass: string | Uint8Array;
    salt: Uint8Array;
    time?: number; // Number of iterations (t_cost)
    mem?: number; // Memory in KiB (m_cost)
    parallelism?: number; // Parallelism factor (p_cost)
    hashLen?: number; // Desired hash length
    type?: ArgonType; // Argon2 variant
  }

  export interface Argon2HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }

  export function hash(options: Argon2HashOptions): Promise<Argon2HashResult>;

  export function verify(options: {
    pass: string | Uint8Array;
    encoded: string;
  }): Promise<boolean>;

  const argon2: {
    hash: typeof hash;
    verify: typeof verify;
    ArgonType: typeof ArgonType;
  };

  export default argon2;
}
