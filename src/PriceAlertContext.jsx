import { createContext, useContext } from "react";
import usePriceAlerts from "./usePriceAlerts.js";

const Ctx = createContext(null);

export function PriceAlertProvider({ children }) {
  const pa = usePriceAlerts();
  return <Ctx.Provider value={pa}>{children}</Ctx.Provider>;
}

export function usePA() {
  return useContext(Ctx);
}
