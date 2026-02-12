import { createContext, useContext, useState, useCallback } from "react";

const CompareContext = createContext(null);
const MAX_COMPARE = 4;

export function CompareProvider({ children }) {
  const [lists, setLists] = useState({});

  const toggleCompare = useCallback((type, slug) => {
    setLists((prev) => {
      const list = prev[type] || [];
      if (list.includes(slug)) return { ...prev, [type]: list.filter((s) => s !== slug) };
      if (list.length >= MAX_COMPARE) return prev;
      return { ...prev, [type]: [...list, slug] };
    });
  }, []);

  const removeFromCompare = useCallback((type, slug) => {
    setLists((prev) => ({
      ...prev,
      [type]: (prev[type] || []).filter((s) => s !== slug),
    }));
  }, []);

  const clearCompare = useCallback((type) => {
    setLists((prev) => ({ ...prev, [type]: [] }));
  }, []);

  const isInCompare = useCallback(
    (type, slug) => (lists[type] || []).includes(slug),
    [lists]
  );

  const getList = useCallback((type) => lists[type] || [], [lists]);
  const getCount = useCallback((type) => (lists[type] || []).length, [lists]);
  const isFull = useCallback((type) => (lists[type] || []).length >= MAX_COMPARE, [lists]);

  return (
    <CompareContext.Provider
      value={{
        lists, toggleCompare, removeFromCompare,
        clearCompare, isInCompare, getList, getCount, isFull,
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
