import { hash, verify } from '@node-rs/argon2'

export async function hashPassword(password: string) {
  return await hash(password)
}

export async function verifyPassword({ password, hash: hashedPassword }: { password: string; hash: string }) {
  return await verify(hashedPassword, password)
}
