const { parseDateVariantsFromMessage } = require("./allocationAnalytics");

const COUNT_INTENT = /\b(count|how many|number|strength|compare|highest|most|total|maximum|largest)\b/i;
const HALL_IDENTIFIER = /\b[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\b/g;
const HALL_REFERENCE = /\bhalls?\s*(?:(?:number|no\.?)\s*)?[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]*)/gi;
const SESSION_PATTERN = /\b(fn|an|forenoon|afternoon)\b/i;

function isHallCountQuery(message) {
  const text = String(message || "").trim();

  // Guard: Generic hall-count questions like "how many halls are allocated for today's exam"
  // should NOT be treated as specific-hall queries. Only proceed if an actual hall identifier
  // (e.g. H101, Room-A1, 101) is present in the message.
  const genericHallCount = /\b(how many halls?|total halls?|number of halls?|halls?\s+(are|is|being|allocated|used|for))/i;
  if (genericHallCount.test(text) && !/\b[A-Za-z]?\d{2,}[A-Za-z0-9]*\b/.test(text)) {
    return false;
  }

  const hasHallIdentifier = /\bhalls?\s*(?:(?:number|no\.?)\s*)?[:#-]?\s*[A-Za-z0-9][A-Za-z0-9_-]*/i.test(text) ||
    HALL_IDENTIFIER.test(text);
  HALL_IDENTIFIER.lastIndex = 0;

  const asksForHallRanking = /\b(highest|most|maximum|largest)\b/i.test(text) &&
    /\b(hall|room|student)\b/i.test(text);
  const asksForAllHalls = /\b(total|overall|all)\b/i.test(text) &&
    /\b(halls?|rooms?)\b/i.test(text);

  return asksForHallRanking || asksForAllHalls ||
    (hasHallIdentifier && (COUNT_INTENT.test(text) || /\bhalls?\b/i.test(text)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseHallCountQuery(message, hallRecords) {
  const text = String(message || "");
  const asksForHallRanking = /\b(highest|most|maximum|largest)\b/i.test(text) &&
    /\b(hall|room|student)\b/i.test(text);
  const asksForAllHalls = /\b(total|overall|all)\b/i.test(text) &&
    /\b(halls?|rooms?)\b/i.test(text);
  const dateVariants = parseDateVariantsFromMessage(text);
  const sessionMatch = text.match(SESSION_PATTERN);
  const session = sessionMatch
    ? (sessionMatch[1].toLowerCase().startsWith("f") ? "FN" : "AN")
    : null;

  if (asksForHallRanking) {
    return { mode: "highest", dateVariants, session };
  }
  if (asksForAllHalls) {
    return { mode: "total", dateVariants, session };
  }

  const requested = [];
  const addId = (id) => {
    const normalized = String(id || "").trim().toUpperCase();
    if (normalized && !requested.includes(normalized)) requested.push(normalized);
  };

  for (const hall of hallRecords) {
    const hallNo = String(hall.hall_no || "").trim();
    if (hallNo && new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(hallNo)}(?=$|[^A-Za-z0-9])`, "i").test(text)) {
      addId(hallNo);
    }
  }

  const referenceText = text.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g, " ");
  for (const match of referenceText.matchAll(new RegExp(HALL_REFERENCE.source, "gi"))) addId(match[1]);
  for (const match of referenceText.matchAll(new RegExp(HALL_IDENTIFIER.source, "g"))) addId(match[0]);

  if (requested.length === 0) return null;
  return {
    mode: /\bcompare\b/i.test(text) || requested.length > 1 ? "compare" : "single",
    hallNos: requested,
    dateVariants,
    session
  };
}

function analyzeHallCountQuery(db, message, callback) {
  db.all("SELECT hall_no FROM halls WHERE hall_no IS NOT NULL AND TRIM(hall_no) != ''", (hallError, hallRecords) => {
    if (hallError) return callback(hallError);

    const query = parseHallCountQuery(message, hallRecords || []);
    if (!query) return callback(null, null);

    const allHalls = (hallRecords || []).map(({ hall_no }) => ({
      hallNo: String(hall_no).trim(),
      normalizedHallNo: String(hall_no).trim().toUpperCase()
    }));
    const hallsById = new Map(allHalls.map((hall) => [hall.normalizedHallNo, hall.hallNo]));
    const requestedHalls = query.hallNos || [];
    const missingHall = requestedHalls.find((hallNo) => !hallsById.has(hallNo));
    if (missingHall) {
      return callback(null, {
        type: "hall_count_analysis",
        reply: `I couldn't find examination hall ${missingHall}. Please check the hall number and try again.`,
        hallCounts: []
      });
    }

    const halls = query.mode === "total" || query.mode === "highest"
      ? allHalls
      : requestedHalls.map((hallNo) => ({
        hallNo: hallsById.get(hallNo),
        normalizedHallNo: hallNo
      }));
    if (halls.length === 0) {
      return callback(null, {
        type: "hall_count_analysis",
        reply: "There are no examination halls registered in the database yet.",
        hallCounts: []
      });
    }

    const allocationFilters = ["TRIM(COALESCE(regno, '')) != ''"];
    const allocationParams = [];
    const validHallPlaceholders = allHalls.map(() => "?").join(", ");
    const validHallParams = allHalls.map((hall) => hall.normalizedHallNo);
    if (query.dateVariants) {
      allocationFilters.push(`exam_date IN (${query.dateVariants.map(() => "?").join(", ")})`);
      allocationParams.push(...query.dateVariants);
    }
    if (query.session) {
      allocationFilters.push("UPPER(TRIM(session)) = ?");
      allocationParams.push(query.session);
    }

    const allocationFilter = allocationFilters.join(" AND ");
    db.get(
      `SELECT exam_date, session
       FROM seat_allocations
       WHERE UPPER(TRIM(hall_no)) IN (${validHallPlaceholders})
         AND ${allocationFilter}
       GROUP BY exam_date, session
       ORDER BY exam_date DESC,
         CASE
           WHEN UPPER(TRIM(session)) IN ('AN', 'AFTERNOON') THEN 1
           WHEN UPPER(TRIM(session)) IN ('FN', 'FORENOON') THEN 0
           ELSE -1
         END DESC,
         session DESC
       LIMIT 1`,
      [...validHallParams, ...allocationParams],
      (sessionError, activeSession) => {
        if (sessionError) return callback(sessionError);

        const hallPlaceholders = halls.map(() => "?").join(", ");
        const countFilters = [
          `UPPER(TRIM(hall_no)) IN (${hallPlaceholders})`,
          ...allocationFilters
        ];
        const countParams = [
          ...halls.map((hall) => hall.normalizedHallNo),
          ...allocationParams
        ];
        if (!activeSession) {
          const result = formatHallCountResponse(query, halls, new Map(), null);
          if (query.mode === "total") result.totalStudents = 0;
          return callback(null, result);
        }

        countFilters.push("exam_date = ?", "UPPER(TRIM(session)) = ?");
        countParams.push(activeSession.exam_date, String(activeSession.session || "").trim().toUpperCase());

        db.all(
          `SELECT UPPER(TRIM(hall_no)) AS hall_no,
                  COUNT(DISTINCT UPPER(TRIM(regno))) AS student_count
           FROM seat_allocations
           WHERE ${countFilters.join(" AND ")}
           GROUP BY UPPER(TRIM(hall_no))`,
          countParams,
          (countError, rows) => {
            if (countError) return callback(countError);
            const countsByHall = new Map((rows || []).map((row) => [row.hall_no, Number(row.student_count) || 0]));
            if (query.mode !== "total") {
              return callback(null, formatHallCountResponse(query, halls, countsByHall, activeSession));
            }

            db.get(
              `SELECT COUNT(DISTINCT UPPER(TRIM(regno))) AS student_count
               FROM seat_allocations
               WHERE UPPER(TRIM(hall_no)) IN (${validHallPlaceholders})
                 AND ${allocationFilter}
                 AND exam_date = ? AND UPPER(TRIM(session)) = ?`,
              [...validHallParams, ...allocationParams, activeSession.exam_date, String(activeSession.session || "").trim().toUpperCase()],
              (totalError, totalRow) => {
                if (totalError) return callback(totalError);
                const result = formatHallCountResponse(query, halls, countsByHall, activeSession);
                result.totalStudents = Number(totalRow?.student_count) || 0;
                result.reply = `There are **${result.totalStudents} students** allocated across all examination halls${sessionLabelFor(activeSession)}.`;
                callback(null, result);
              }
            );
          }
        );
      }
    );
  });
}

function formatHallCountResponse(query, halls, countsByHall, activeSession) {
  const hallCounts = halls.map((hall) => ({
    hallNo: hall.hallNo,
    studentCount: countsByHall.get(hall.normalizedHallNo) || 0
  }));
  const sessionLabel = activeSession
    ? ` for ${activeSession.exam_date} (${activeSession.session} session)`
    : "";
  let reply;

  if (query.mode === "single") {
    const hall = hallCounts[0];
    reply = `The examination hall **${hall.hallNo}** currently has **${hall.studentCount} student${hall.studentCount === 1 ? "" : "s"}** allocated${sessionLabel}.`;
  } else if (query.mode === "compare") {
    reply = `Student counts by examination hall${sessionLabel}:`;
  } else if (query.mode === "total") {
    const total = hallCounts.reduce((sum, hall) => sum + hall.studentCount, 0);
    reply = `There are **${total} students** allocated across all examination halls${sessionLabel}.`;
  } else {
    const highest = Math.max(...hallCounts.map((hall) => hall.studentCount));
    const highestHalls = hallCounts.filter((hall) => hall.studentCount === highest);
    reply = highest === 0
      ? `There are no student allocations to rank across the examination halls${sessionLabel}.`
      : `**${highestHalls.map((hall) => hall.hallNo).join(", ")}** ${highestHalls.length === 1 ? "has" : "have"} the highest number of students: **${highest}**${sessionLabel}.`;
    return {
      type: "hall_count_analysis",
      mode: query.mode,
      hallCounts: highest === 0 ? hallCounts : highestHalls,
      session: activeSession || null,
      reply
    };
  }

  return {
    type: "hall_count_analysis",
    mode: query.mode,
    hallCounts,
    session: activeSession || null,
    reply
  };
}

function sessionLabelFor(activeSession) {
  return activeSession ? ` for ${activeSession.exam_date} (${activeSession.session} session)` : "";
}

module.exports = {
  isHallCountQuery,
  parseHallCountQuery,
  analyzeHallCountQuery
};
