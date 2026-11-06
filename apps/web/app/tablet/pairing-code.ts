/**
 * Japanese-only validation for the 8-digit pairing code. The browser's native required/pattern
 * messages follow the device language, so the form validates here instead. Returns an empty
 * string when the code is valid. The code itself is never part of the message.
 */
export function pairingCodeProblem(code: string): string {
  if (code.length === 0) return "8桁の接続コードを入力してください。";
  if (!/^[0-9]+$/.test(code)) return "接続コードは数字だけで入力してください。";
  if (code.length !== 8) return "接続コードは8桁です。桁数を確認してください。";
  return "";
}
