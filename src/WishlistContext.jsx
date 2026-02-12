import { createContext, useContext } from "react";
import useWishlist from "./useWishlist.js";

const Ctx = createContext(null);

export function WishlistProvider({ children }) {
  const wl = useWishlist();
  return <Ctx.Provider value={wl}>{children}</Ctx.Provider>;
}

export function useWL() {
  return useContext(Ctx);
}
