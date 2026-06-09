import { scryptSync, randomBytes } from "node:crypto";
import { stdin, stdout, stderr, exit } from "node:process";
import { createInterface } from "node:readline/promises";

const password = process.argv[2] ?? (await promptPassword());

if (!password) {
  stderr.write("Password is required.\n");
  exit(1);
}

const salt = randomBytes(16).toString("base64url");
const cost = 16384;
const blockSize = 8;
const parallelization = 1;
const hash = scryptSync(password, salt, 64, {
  N: cost,
  r: blockSize,
  p: parallelization,
  maxmem: 64 * 1024 * 1024
}).toString("base64url");

stdout.write(`scrypt:v1:${cost}:${blockSize}:${parallelization}:${salt}:${hash}\n`);

async function promptPassword() {
  const rl = createInterface({ input: stdin, output: stdout });
  const value = await rl.question("Password: ");
  rl.close();
  return value;
}
