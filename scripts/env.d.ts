// 测试脚本运行环境的最小类型声明（避免依赖 @types/node）
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:assert/strict' {
  const assert: {
    equal(a: unknown, b: unknown, msg?: string): void;
    notEqual(a: unknown, b: unknown, msg?: string): void;
    ok(v: unknown, msg?: string): void;
    throws(fn: () => void, re: RegExp): void;
    deepEqual(a: unknown, b: unknown, msg?: string): void;
  };
  export default assert;
}
declare const process: { cwd(): string; exit(code: number): void };
