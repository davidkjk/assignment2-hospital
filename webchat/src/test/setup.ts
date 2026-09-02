import '@testing-library/jest-dom';

// 이 jsdom(25)+vitest 조합은 localStorage를 객체로만 노출하고 setItem/getItem을
// 함수로 붙여 주지 않는다. 위젯의 익명 토큰(WEBCHAT-ROOM-04·05)은 localStorage에
// 얹혀 있으므로, 함수가 아닐 때만 인메모리 Storage로 대체한다(실제 브라우저엔 영향 없음).
if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>();
    get length(): number { return this.store.size; }
    clear(): void { this.store.clear(); }
    getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
    key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
    removeItem(key: string): void { this.store.delete(key); }
    setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
}
