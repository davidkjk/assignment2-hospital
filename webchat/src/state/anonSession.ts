const KEY = 'webchat_anon_token'; // 같은 브라우저만. 다른 기기엔 없다(WEBCHAT-ROOM-05).

export const loadAnonToken = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const saveAnonToken = (token: string): void => {
  try { localStorage.setItem(KEY, token); } catch { /* 저장 불가여도 세션은 진행 */ }
};
export const clearAnonToken = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
};
