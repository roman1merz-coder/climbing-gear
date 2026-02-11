import { createContext, useContext, useState, useCallback } from "react";

const CompareContext = createContext(null);
const MAX_COMPARE = 4;

export function CompareProvider({ children }) {
  const [compareList, setCompareList] = useState([]);

  const toggleCompare = useCallback((slug) => {
    setCompareList((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, slug];
    });
  }, []);

  const removeFromCompare = useCallback((slug) => {
    setCompareList((prev) => prev.filter((s) => s !== slug));
  }, []);

  const clearCompare = useCallback(() => setCompareList([]), []);

  const isInCompare = useCallback(
    (slug) => compareList.includes(slug),
    [compareList]
  );

  return (
    <CompareContext.Provider
      value={{
        compareList, toggleCompare, removeFromCompare,
        clearCompare, isInCompare,
        isFull: compareList.length >= MAX_COMPARE,
        count: compareList.length,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within <CompareProvider>");
  return ctx;
}

export default CompareContext;
