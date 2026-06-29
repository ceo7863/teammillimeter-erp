const loginId = process.argv[2] || "admin";
const password = process.argv[3] || "1234";
const month = process.argv[4] || "2026-06";
const base = `http://127.0.0.1:${process.env.PORT || 8080}`;

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ loginId, password }),
});
const { token } = await loginRes.json();
if (!token) {
  console.error("login failed");
  process.exit(1);
}

const res = await fetch(`${base}/api/sc-schedules?month=${encodeURIComponent(month)}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
const rows = data.schedules || [];
const withParticipants = rows.filter((r) => Array.isArray(r.participants) && r.participants.length);
const withWorkLog = rows.filter((r) => r.workLog?.startTime);
const withMealExpense = rows.filter((r) =>
  (r.participants || []).some((p) => p.meal || p.expense),
);
console.log(
  JSON.stringify(
    {
      month,
      count: rows.length,
      withParticipants: withParticipants.length,
      withWorkLog: withWorkLog.length,
      withMealExpense: withMealExpense.length,
      sample: rows[0]
        ? {
            id: rows[0].id,
            workType: rows[0].workType,
            workDate: rows[0].workDate,
            participantNames: rows[0].participantNames,
            participants: rows[0].participants,
            workLog: rows[0].workLog,
          }
        : null,
    },
    null,
    2,
  ),
);
