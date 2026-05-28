import { config } from "./config.mjs";

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function isCheckCardBankTransaction(tx) {
  const normalized = String(tx.transactionType || "").toLowerCase().replace(/\s+/g, "");
  if (!normalized) return false;
  return normalized.includes("\uCCB4\uD06C") || normalized.includes("check");
}

function buildLedgerMatchHaystack(tx) {
  return normalizeText([tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" "));
}

function heuristicClassify(tx, expenseCategories, fixedExpenses) {
  const haystack = buildLedgerMatchHaystack(tx);
  const withdrawal = Number(tx.withdrawal || 0);

  let bestFixed = null;
  if (!isCheckCardBankTransaction(tx)) {
    for (const row of fixedExpenses) {
    const nameKey = normalizeText(row.name);
    if (nameKey.length < 2) continue;
    let score = haystack.includes(nameKey) ? 12 + nameKey.length : 0;
    if (withdrawal > 0 && Number(row.amount) === withdrawal) score += 10;
    if (score >= 12 && (!bestFixed || score > bestFixed.score)) {
      bestFixed = { id: row.id, score, category: row.category };
    }
    }
  }

  if (bestFixed) {
    return {
      transactionId: tx.id,
      kind: "fixed",
      fixedExpenseId: bestFixed.id,
      category: bestFixed.category,
      confidence: Math.min(92, 70 + bestFixed.score),
      source: "heuristic",
    };
  }

  const rules = [
    ["??/??", ["??", "?", "??", "??", "??", "??"]],
    ["??/??", ["??", "??", "??", "??", "??"]],
    ["???", ["??", "kt", "skt", "lgu"]],
    ["???", ["??", "??", "??"]],
    ["????", ["??", "??"]],
    ["???", ["??", "???"]],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      const safe = expenseCategories.includes(category) ? category : expenseCategories[0] || "??";
      return {
        transactionId: tx.id,
        kind: "manual",
        category: safe,
        confidence: 72,
        source: "heuristic",
      };
    }
  }

  return {
    transactionId: tx.id,
    kind: "manual",
    category: expenseCategories[0] || "??",
    confidence: 55,
    source: "heuristic",
  };
}

async function classifyWithOpenAi(transactions, expenseCategories, fixedExpenses) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const fixedList = fixedExpenses
    .slice(0, 40)
    .map((row) => `${row.id}: ${row.name} (${row.category}, ${row.amount}?)`)
    .join("\n");

  const prompt = [
    "?? ?? ?? ?? ??? ??? ???? ?????.",
    `?? ????: ${expenseCategories.join(", ")}`,
    `??? ??:\n${fixedList || "(??)"}`,
    "JSON ??? ??: [{\"transactionId\",\"kind\":\"manual|fixed\",\"category\",\"fixedExpenseId\",\"confidence\":0-100}]",
    "??:",
    ...transactions.map(
      (tx) =>
        `- id=${tx.id} ??=${tx.counterpartyName || ""} ??=${tx.description || ""} ??=${tx.withdrawal}`,
    ),
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: "Respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) return null;

  return parsed
    .map((row) => ({
      transactionId: String(row.transactionId || ""),
      kind: row.kind === "fixed" ? "fixed" : "manual",
      category: row.category ? String(row.category) : undefined,
      fixedExpenseId: row.fixedExpenseId ? String(row.fixedExpenseId) : undefined,
      confidence: Number(row.confidence) || 70,
      source: "llm",
    }))
    .filter((row) => row.transactionId);
}

export async function classifyBankLedgerBatch(body) {
  const transactions = Array.isArray(body?.transactions) ? body.transactions : [];
  const expenseCategories = Array.isArray(body?.expenseCategories)
    ? body.expenseCategories.map((item) => String(item || "").trim()).filter(Boolean)
    : ["??"];
  const fixedExpenses = Array.isArray(body?.fixedExpenses)
    ? body.fixedExpenses
        .map((row) => ({
          id: String(row?.id || ""),
          name: String(row?.name || ""),
          category: String(row?.category || ""),
          amount: Number(row?.amount) || 0,
        }))
        .filter((row) => row.id)
    : [];

  if (!transactions.length) return { items: [], engine: "none" };

  const llm = await classifyWithOpenAi(transactions, expenseCategories, fixedExpenses);
  if (llm?.length) {
    return { items: llm, engine: "openai" };
  }

  return {
    items: transactions.map((tx) => heuristicClassify(tx, expenseCategories, fixedExpenses)),
    engine: config.openAiConfigured ? "heuristic" : "heuristic",
  };
}
