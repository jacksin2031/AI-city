import { FocusBroker } from "./focus";

const shared = globalThis as typeof globalThis & { aiCityFocus?: FocusBroker };
shared.aiCityFocus ??= new FocusBroker();
export const focusBroker = shared.aiCityFocus;
