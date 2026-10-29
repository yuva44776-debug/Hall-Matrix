// utils/allocationAnalytics.js

/**
 * Returns an array of common date string representations for a given Date object in the server's local timezone.
 * e.g. YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, D/M/YYYY, D-M-YYYY, YYYY/MM/DD
 */
function getTodayDateVariants(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, "0");
  const d = String(refDate.getDate()).padStart(2, "0");
  const mRaw = String(refDate.getMonth() + 1);
  const dRaw = String(refDate.getDate());

  return Array.from(
    new Set([
      `${y}-${m}-${d}`,       // 2026-09-13
      `${d}/${m}/${y}`,       // 13/09/2026
      `${d}-${m}-${y}`,       // 13-09-2026
      `${y}/${m}/${d}`,       // 2026/09/13
      `${dRaw}/${mRaw}/${y}`, // 13/9/2026
      `${dRaw}-${mRaw}-${y}`  // 13-9-2026
    ])
  );
}

/**
 * Extracts explicit date variants from a message string if present (YYYY-MM-DD or DD/MM/YYYY).
 */
function parseDateVariantsFromMessage(message) {
  if (!message) return null;
  const ymdMatch = message.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const dmyMatch = message.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);

  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, "0");
    const d = String(ymdMatch[3]).padStart(2, "0");
    const mRaw = String(parseInt(ymdMatch[2], 10));
    const dRaw = String(parseInt(ymdMatch[3], 10));
    return Array.from(
      new Set([
        `${y}-${m}-${d}`,
        `${d}/${m}/${y}`,
        `${d}-${m}-${y}`,
        `${y}/${m}/${d}`,
        `${dRaw}/${mRaw}/${y}`,
        `${dRaw}-${mRaw}-${y}`
      ])
    );
  }

  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, "0");
    const m = String(dmyMatch[2]).padStart(2, "0");
    const y = dmyMatch[3];
    const dRaw = String(parseInt(dmyMatch[1], 10));
    const mRaw = String(parseInt(dmyMatch[2], 10));
    return Array.from(
      new Set([
        `${y}-${m}-${d}`,
        `${d}/${m}/${y}`,
        `${d}-${m}-${y}`,
        `${y}/${m}/${d}`,
        `${dRaw}/${mRaw}/${y}`,
        `${dRaw}-${mRaw}-${y}`
      ])
    );
  }

  return null;
}

/**
 * Detects whether an AI chat message is asking about today's (or a specified date's) exam allocations.
 * Returns: 'today_students_count' | 'today_halls_count' | 'today_summary' | null
 */
function detectAllocationQueryIntent(message) {
  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return null;

  // Exclude personal student seat lookup ("where is my hall", "my seat", etc.)
  if (
    lower.includes("my hall") ||
    lower.includes("my seat") ||
    lower.includes("my room") ||
    lower.includes("where is my") ||
    lower.includes("my exam hall")
  ) {
    return null;
  }

  // Check if a specific single hall number is queried (e.g. 'in hall 101', 'hall H101', 'for hall 102')
  const specificHallMatch =
    lower.match(/\bhall\s*[:\-]?\s*([hH]?[0-9]+)\b/i) ||
    lower.match(/\b(?:in|at|for)\s+hall\s*[:\-]?\s*([a-z0-9_\-]+)\b/i);
  const isGenericHallCount = /\b(how many halls?|total halls?|total exam halls?|number of halls?|how many rooms?|total rooms?|number of rooms?)\b/i.test(lower);
  if (specificHallMatch && !isGenericHallCount) {
    return null;
  }

  const hasExplicitOtherDate =
    lower.includes("tomorrow") ||
    lower.includes("yesterday") ||
    lower.match(/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/) ||
    lower.match(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/);

  const isToday =
    lower.includes("today") ||
    lower.includes("inaiku") ||
    lower.includes("inayikku") ||
    !hasExplicitOtherDate;

  const asksStudents =
    /\b(how many students?|total students?|student count|number of students?|students? count|students? appearing|students? writing|students? allocated|students? have exams?|students? are writing|students? are appearing)\b/i.test(lower) ||
    (/\b(students?|candidates?|pupils?)\b/i.test(lower) &&
      /\b(how many|total|totally|count|number of|appearing|writing|allocated|strength|headcount)\b/i.test(lower));

  const asksHalls =
    /\b(how many halls?|total halls?|hall count|number of halls?|halls? count|halls? allocated|halls? used|halls? being used|how many rooms?|total rooms?|room count|number of rooms?|rooms? allocated|rooms? used|rooms? being used)\b/i.test(lower) ||
    (/\b(halls?|rooms?|classrooms?)\b/i.test(lower) &&
      /\b(how many|total|totally|count|number of|allocated|used|being used)\b/i.test(lower));

  if (asksStudents && asksHalls) {
    return "today_summary";
  }

  if (asksStudents) {
    return "today_students_count";
  }

  if (asksHalls) {
    return "today_halls_count";
  }

  return null;
}

/**
 * Queries database and computes allocation analytics for the specified date variants.
 * Guarantees:
 * - COUNT(DISTINCT regno) to prevent student double-counting.
 * - COUNT(DISTINCT hall_no) to prevent hall double-counting.
 */
function getExamAllocationAnalytics(db, dateVariants, callback) {
  if (!db) return callback(new Error("Database connection is required"));
  if (!Array.isArray(dateVariants) || dateVariants.length === 0) {
    dateVariants = getTodayDateVariants();
  }

  const placeholders = dateVariants.map(() => "?").join(",");
  const mainQuery = `
    SELECT 
      COUNT(DISTINCT NULLIF(UPPER(TRIM(regno)), '')) as student_count,
      COUNT(DISTINCT NULLIF(UPPER(TRIM(hall_no)), '')) as hall_count,
      GROUP_CONCAT(DISTINCT NULLIF(UPPER(TRIM(hall_no)), '')) as halls_list,
      GROUP_CONCAT(DISTINCT subject_code) as subject_codes,
      GROUP_CONCAT(DISTINCT dept) as departments,
      GROUP_CONCAT(DISTINCT session) as sessions_list,
      COUNT(*) as total_records
    FROM seat_allocations
    WHERE exam_date IN (${placeholders})
  `;

  db.get(mainQuery, dateVariants, (err, row) => {
    if (err) return callback(err);

    if (row && row.total_records > 0 && (row.student_count > 0 || row.hall_count > 0)) {
      // Query session-wise breakdown for detailed reporting
      db.all(
        `SELECT session, 
                COUNT(DISTINCT NULLIF(UPPER(TRIM(regno)), '')) as student_count, 
                COUNT(DISTINCT NULLIF(UPPER(TRIM(hall_no)), '')) as hall_count,
                GROUP_CONCAT(DISTINCT subject_code) as subject_codes
         FROM seat_allocations
         WHERE exam_date IN (${placeholders})
         GROUP BY session
         ORDER BY session`,
        dateVariants,
        (err2, sessionRows) => {
          if (err2) return callback(err2);

          const hallsArray = row.halls_list
            ? row.halls_list.split(",").map((h) => h.trim()).filter(Boolean)
            : [];
          const subjectsArray = row.subject_codes
            ? row.subject_codes.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
          const deptsArray = row.departments
            ? row.departments.split(",").map((d) => d.trim()).filter(Boolean)
            : [];

          callback(null, {
            hasAllocations: true,
            totalStudents: row.student_count || 0,
            totalHalls: row.hall_count || 0,
            halls: hallsArray,
            subjectCodes: subjectsArray,
            departments: deptsArray,
            sessions: sessionRows || [],
            totalRecords: row.total_records || 0,
            primaryDate: dateVariants[0]
          });
        }
      );
    } else {
      // Check other dates to provide helpful context if today has no allocations
      db.all(
        `SELECT exam_date, session, 
                COUNT(DISTINCT NULLIF(UPPER(TRIM(regno)), '')) as student_count, 
                COUNT(DISTINCT hall_no) as hall_count,
                GROUP_CONCAT(DISTINCT subject_code) as subject_codes
         FROM seat_allocations
         GROUP BY exam_date, session
         ORDER BY exam_date DESC
         LIMIT 3`,
        (errOther, otherRows) => {
          callback(null, {
            hasAllocations: false,
            totalStudents: 0,
            totalHalls: 0,
            halls: [],
            subjectCodes: [],
            departments: [],
            sessions: [],
            totalRecords: 0,
            primaryDate: dateVariants[0],
            otherSchedules: otherRows || []
          });
        }
      );
    }
  });
}

/**
 * Formats a clean, admin-friendly response based on dynamic database allocation analytics.
 */
function formatAllocationResponse(intent, data, isToday = true, dateLabel = "today") {
  const displayDate = isToday ? "today" : dateLabel;

  if (!data || !data.hasAllocations) {
    // Show other available schedules instead of "no exam today"
    let otherInfo = "";
    if (data && data.otherSchedules && data.otherSchedules.length > 0) {
      const scheduleLines = data.otherSchedules
        .map(r => `  • **${r.exam_date} (${r.session})**: ${r.student_count} students across ${r.hall_count} halls — Subjects: \`${r.subject_codes || 'N/A'}\``)
        .join("\n");
      otherInfo = `\n\n**Available Exam Schedules in Database:**\n${scheduleLines}`;
    }

    if (isToday) {
      return `No seating allocations were found matching your query.${otherInfo}`;
    }
    return `No seating allocations found for **${displayDate}**.${otherInfo}`;
  }

  if (intent === "today_students_count") {
    return isToday
      ? `A total of **${data.totalStudents}** students are allocated to write exams today.`
      : `A total of **${data.totalStudents}** students are allocated to write exams on **${displayDate}**.`;
  }

  if (intent === "today_halls_count") {
    const hallsList = data.halls && data.halls.length > 0
      ? `\n\n🏫 **Allocated Halls:**\n${data.halls.sort().map(h => `  • **${h}**`).join("\n")}`
      : "";
    return isToday
      ? `A total of **${data.totalHalls}** hall${data.totalHalls === 1 ? " is" : "s are"} allocated for today's exam.${hallsList}`
      : `A total of **${data.totalHalls}** hall${data.totalHalls === 1 ? " is" : "s are"} allocated for the exam on **${displayDate}**.${hallsList}`;
  }

  // Summary (when both students and halls are explicitly requested)
  const hallsList = data.halls && data.halls.length > 0
    ? `\n\n🏫 **Allocated Halls:**\n${data.halls.sort().map(h => `  • **${h}**`).join("\n")}`
    : "";
  return isToday
    ? `A total of **${data.totalStudents}** students are allocated to write the exam across **${data.totalHalls}** halls.${hallsList}`
    : `On **${displayDate}**, a total of **${data.totalStudents}** students are allocated across **${data.totalHalls}** halls.${hallsList}`;
}

/**
 * Returns total unique students writing exam today.
 */
function getTodayExamStudentCount(db, callback) {
  const dateVariants = getTodayDateVariants();
  getExamAllocationAnalytics(db, dateVariants, (err, analytics) => {
    if (err) return callback(err);
    callback(null, analytics.totalStudents, analytics);
  });
}

/**
 * Returns total unique halls allocated for exam today.
 */
function getTodayAllocatedHallCount(db, callback) {
  const dateVariants = getTodayDateVariants();
  getExamAllocationAnalytics(db, dateVariants, (err, analytics) => {
    if (err) return callback(err);
    callback(null, analytics.totalHalls, analytics);
  });
}

module.exports = {
  getTodayDateVariants,
  parseDateVariantsFromMessage,
  detectAllocationQueryIntent,
  getExamAllocationAnalytics,
  formatAllocationResponse,
  getTodayExamStudentCount,
  getTodayAllocatedHallCount
};
