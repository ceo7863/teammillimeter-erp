import React, { createContext, memo, useContext, useMemo } from "react";

type BankSyncMeta = {
  erpVersion: number;
  bankListRefreshAt: string;
};

const BankSyncMetaContext = createContext<BankSyncMeta>({
  erpVersion: 0,
  bankListRefreshAt: "",
});

export function BankSyncMetaProvider({
  erpVersion,
  bankListRefreshAt,
  children,
}: {
  erpVersion: number;
  bankListRefreshAt: string;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ erpVersion, bankListRefreshAt }),
    [erpVersion, bankListRefreshAt],
  );
  return <BankSyncMetaContext.Provider value={value}>{children}</BankSyncMetaContext.Provider>;
}

export function useBankSyncMeta(): BankSyncMeta {
  return useContext(BankSyncMetaContext);
}

export const BankListRefreshAtSuffix = memo(function BankListRefreshAtSuffix() {
  const { bankListRefreshAt } = useBankSyncMeta();
  if (!bankListRefreshAt) return null;
  const label = new Date(bankListRefreshAt).toLocaleTimeString("ko-KR");
  return (
    <>
      {" \u00B7 "}
      {"\uBAA9\uB85D \uAC31\uC2E0 "}
      {label}
    </>
  );
});
