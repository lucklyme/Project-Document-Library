import crypto from "node:crypto";

const scryptCost = 16384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const keyLength = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto
    .scryptSync(password, salt, keyLength, {
      N: scryptCost,
      r: scryptBlockSize,
      p: scryptParallelization,
      maxmem: 64 * 1024 * 1024
    })
    .toString("base64url");

  return `scrypt:v1:${scryptCost}:${scryptBlockSize}:${scryptParallelization}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, version, cost, blockSize, parallelization, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !cost || !blockSize || !parallelization || !salt || !expected) {
    return false;
  }

  const actual = crypto
    .scryptSync(password, salt, Buffer.from(expected, "base64url").length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024
    })
    .toString("base64url");

  return safeEqual(actual, expected);
}

export function validatePasswordPolicy(password: string, email?: string) {
  const issues: string[] = [];
  const localPart = email?.split("@")[0]?.toLowerCase();

  if (password.length < 12) {
    issues.push("密码至少需要 12 位。");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("密码需要包含小写字母。");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("密码需要包含大写字母。");
  }
  if (!/\d/.test(password)) {
    issues.push("密码需要包含数字。");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("密码需要包含特殊字符。");
  }
  if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    issues.push("密码不能包含邮箱用户名。");
  }

  return {
    ok: issues.length === 0,
    message: issues.join(" ")
  };
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}
