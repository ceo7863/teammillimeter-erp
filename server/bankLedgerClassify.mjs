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
    ["교통/주차", ["교통", "주", "주차", "택시", "톨", "고속"]],
    ["접대/식비", ["식", "식사", "식대", "커피", "카페"]],
    ["통신비", ["통신", "kt", "skt", "lgu"]],
    ["소모품", ["소모", "문구", "용품"]],
    ["마케팅", ["광고", "마케"]],
    ["방문/외부", ["출장", "외부"]],
  ];

  for (const [category, keywords] of rules) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      const safe = expenseCategories.includes(category) ? category : expenseCategories[0] || "기타";
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
    category: expenseCategories[0] || "기타",
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
    .map((row) => `${row.id}: ${row.name} (${row.category}, ${row.amount}원)`)
    .join("\n");

  const prompt = [
    "은행 출금 거래를 아래 카테고리로 분류해 주세요.",
    `카테고리 목록: ${expenseCategories.join(", ")}`,
    `고정비 후보:\n${fixedList || "(없음)"}`,
    'JSON 배열 형식: [{"transactionId","kind":"manual|fixed","category","fixedExpenseId","confidence":0-100}]',
    "거래:",
    ...transactions.map(
      (tx) =>
        `- id=${tx.id} 상대=${tx.counterpartyName || ""} 적요=${tx.description || ""} 출금=${tx.withdrawal}`,
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
    : ["기타"];
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
