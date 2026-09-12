// jsdom(이 설정)에는 동작하는 localStorage가 없다 — 값은 빈 객체다. 실제 브라우저에서는
// 정상 동작하므로, 테스트에서만 인메모리 Storage를 전역에 끼워 넣어 초안 보관을 검증한다.
// (공유 test/setup.ts는 건드리지 않는다.)

export function installMemoryStorage(): void {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
}
