import bcrypt from 'bcryptjs';
const password = process.argv[2];
if (!password) { console.error('用法：pnpm tsx scripts/hash-password.ts <密码>'); process.exit(1); }
if (password.length < 12) { console.error('密码至少 12 位。'); process.exit(1); }
const hash=await bcrypt.hash(password,12);
// Base64 keeps bcrypt's `$` delimiters safe in both Next.js and Compose .env parsers.
console.log(Buffer.from(hash,'utf8').toString('base64'));
