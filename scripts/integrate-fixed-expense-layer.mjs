import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "../src/components/CompanyLedgerPage.tsx");
let s = fs.readFileSync(file, "utf8");

if (!s.includes("CompanyLedgerFixedExpenseModalLayer")) {
  s = s.replace(
    'import type { ErpUser } from "@/utils/erpApi";\n',
    'import type { ErpUser } from "@/utils/erpApi";\nimport {\n  CompanyLedgerFixedExpenseModalLayer,\n  type CompanyLedgerFixedExpenseModalHandle,\n} from "@/components/CompanyLedgerFixedExpenseModalLayer";\n',
  );
}

s = s.replace(
  /const \[fixedExpenseModal, setFixedExpenseModal\] = useState<FixedExpenseModalState \| null>\(null\);\r?\n/,
  "const fixedExpenseModalRef = useRef<CompanyLedgerFixedExpenseModalHandle>(null);\n",
);

s = s.replace(
  /const fixedCategorySelectOptions = useMemo\(\r?\n    \(\) =>\r?\n      buildFixedCategorySelectOptions\(fixedExpenses, fixedExpenseCategories, fixedExpenseModal\?\.category\),\r?\n    \[fixedExpenses, fixedExpenseCategories, fixedExpenseModal\?\.category\],\r?\n  \);\r?\n\r?\n/,
  "",
);

s = s.replace(
  /  const openCreateFixedExpense = \(\) => \{\r?\n    setFormError\(""\);\r?\n    setFixedExpenseModal\(\r?\n      emptyFixedExpenseForm\(fixedExpenseCategories\[0\] \|\| FIXED_CATEGORY_OPTIONS\[0\]\),\r?\n    \);\r?\n  \};\r?\n\r?\n  const openEditFixedExpense = \(row: FixedExpense\) => \{\r?\n    setFormError\(""\);\r?\n    setFixedExpenseModal\(\{\r?\n      mode: "edit",\r?\n      id: row\.id,\r?\n      name: row\.name,\r?\n      category: row\.category,\r?\n      amount: String\(row\.amount \|\| ""\),\r?\n      cycle: row\.cycle,\r?\n      paymentDayOfMonth: String\(normalizeFixedExpensePaymentDay\(row\.paymentDayOfMonth\)\)\),\r?\n      startDate: row\.startDate \|\| todayISO\(\),\r?\n      memo: row\.memo \|\| "",\r?\n      isActive: row\.isActive,\r?\n    \}\);\r?\n  \};\r?\n\r?\n  const saveFixedExpense = \(\) => \{[\s\S]*?  \};\r?\n\r?\n  const deleteFixedExpense = \(\) => \{[\s\S]*?  \};\r?\n\r?\n/,
  `  const openCreateFixedExpense = () => {
    fixedExpenseModalRef.current?.openCreateFixedExpense(
      fixedExpenseCategories[0] || FIXED_CATEGORY_OPTIONS[0],
    );
  };

  const openEditFixedExpense = (row: FixedExpense) => {
    fixedExpenseModalRef.current?.openEditFixedExpense(row);
  };

`,
);

s = s.replace(
  /\r?\n      \{fixedExpenseModal \? \([\s\S]*?\r?\n      \) : null\}\r?\n\r?\n      \{manualModal \? \(/,
  "\n\n      <CompanyLedgerFixedExpenseModalLayer\n        ref={fixedExpenseModalRef}\n        fixedExpenses={fixedExpenses}\n        setFixedExpenses={setFixedExpenses}\n        fixedExpenseCategories={fixedExpenseCategories}\n        setFixedExpenseCategories={setFixedExpenseCategories}\n        fixedExpensePayments={fixedExpensePayments}\n        setFixedExpensePayments={setFixedExpensePayments}\n        bankTransactions={bankTransactions}\n        setBankTransactions={setBankTransactions}\n        setBankLedgerRules={setBankLedgerRules}\n        currentUser={currentUser}\n        onOpenBankLinkView={(view) => setBankLinkView(view)}\n        onCloseBankLinkView={() => setBankLinkView(null)}\n      />\n\n      {manualModal ? (",
);

s = s.replace(/type FixedExpenseModalState = \{[\s\S]*?\};\r?\n\r?\n/, "");
s = s.replace(/function emptyFixedExpenseForm\([\s\S]*?\}\r?\n\r?\n/, "");

// drop imports only used by removed fixed modal inline (careful)
s = s.replace(/\r?\n  FIXED_CYCLE_OPTIONS,/, "");
s = s.replace(/\r?\n  buildFixedCategorySelectOptions,/, "");
s = s.replace(/\r?\n  validateFixedExpenseInput,/, "");

fs.writeFileSync(file, s, "utf8");
console.log("integrated", file);