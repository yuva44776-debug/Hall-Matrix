// backend/utils/tutorAiService.js
const { getTodayDateVariants } = require("./allocationAnalytics");
const { getTenantDb } = require("./tenantDb");

/**
 * Standard department aliases mapping to canonical department code.
 */
const DEPT_MAP = {
  "it": "IT",
  "information technology": "IT",
  "b.tech it": "IT",
  "btech it": "IT",
  "b.tech. it": "IT",
  "b tech it": "IT",

  "cse": "CSE",
  "computer science": "CSE",
  "computer science and engineering": "CSE",
  "computer science & engineering": "CSE",
  "b.e cse": "CSE",
  "be cse": "CSE",
  "b.e. cse": "CSE",

  "aids": "AIDS",
  "ai & ds": "AIDS",
  "ai and ds": "AIDS",
  "artificial intelligence and data science": "AIDS",
  "artificial intelligence & data science": "AIDS",

  "aiml": "AIML",
  "ai & ml": "AIML",
  "ai and ml": "AIML",
  "artificial intelligence and machine learning": "AIML",
  "artificial intelligence & machine learning": "AIML",

  "ece": "ECE",
  "electronics and communication": "ECE",
  "electronics and communication engineering": "ECE",
  "electronics & communication engineering": "ECE",
  "b.e ece": "ECE",
  "be ece": "ECE",

  "eee": "EEE",
  "electrical and electronics": "EEE",
  "electrical and electronics engineering": "EEE",
  "electrical & electronics engineering": "EEE",
  "b.e eee": "EEE",
  "be eee": "EEE",

  "mech": "MECH",
  "mechanical": "MECH",
  "mechanical engineering": "MECH",
  "b.e mech": "MECH",
  "be mech": "MECH",

  "civil": "CIVIL",
  "civil engineering": "CIVIL",
  "b.e civil": "CIVIL",
  "be civil": "CIVIL"
};

/**
 * Normalizes a department string to its standard code (e.g. "Information Technology" -> "IT").
 */
function normalizeDepartment(rawDept) {
  if (!rawDept) return "";
  let clean = String(rawDept).trim().toLowerCase();
  clean = clean.replace(/^(b\.?tech\.?|b\.?e\.?)\s*[-:]?\s*/i, "");
  clean = clean.replace(/\s+/g, " ").trim();

  if (DEPT_MAP[clean]) return DEPT_MAP[clean];

  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (clean === key || clean.includes(key)) {
      return val;
    }
  }

  return rawDept.trim().toUpperCase();
}

/**
 * Normalizes batch format (e.g., handles hyphens, en-dash, em-dash, and whitespace).
 * 2023–2027 -> 2023-2027
 */
function normalizeBatch(rawBatch) {
  if (!rawBatch) return "";
  return String(rawBatch)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .trim();
}

/**
 * Formats session into standard exam timing.
 */
function formatSessionTime(session) {
  const s = String(session || "").trim().toUpperCase();
  if (s === "FN" || s.startsWith("FORE")) {
    return "10:00 AM – 1:00 PM";
  }
  if (s === "AN" || s.startsWith("AFTER")) {
    return "2:00 PM – 5:00 PM";
  }
  if (s.includes("AM") || s.includes("PM") || s.includes("-") || s.includes("–")) {
    return s;
  }
  return s || "10:00 AM – 1:00 PM";
}

/**
 * Formats a date string (YYYY-MM-DD or DD/MM/YYYY) into readable English format.
 * style: 'long' -> "14 September 2026"
 * style: 'short' -> "14 Sep 2026"
 */
function formatExamDate(dateStr, style = "long") {
  if (!dateStr) return "";
  const monthsLong = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthsShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  let y, m, d;
  const clean = String(dateStr).trim().split("T")[0];
  const ymd = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (ymd) {
    y = parseInt(ymd[1], 10);
    m = parseInt(ymd[2], 10) - 1;
    d = parseInt(ymd[3], 10);
  } else if (dmy) {
    d = parseInt(dmy[1], 10);
    m = parseInt(dmy[2], 10) - 1;
    y = parseInt(dmy[3], 10);
  } else {
    return dateStr;
  }

  if (m < 0 || m > 11) return dateStr;
  const monthName = style === "short" ? monthsShort[m] : monthsLong[m];
  return `${d} ${monthName} ${y}`;
}

/**
 * Detects whether the tutor query is for Today's Exam, Timetable, or General.
 */
function detectTutorIntent(message) {
  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return null;

  // 1. Timetable / Schedule Intent
  const timetableKeywords = [
    "timetable", "time table", "schedule", "exam schedule",
    "upcoming exams", "upcoming exam", "exams upcoming", "coming up",
    "when are my students' exams", "when are my students exams",
    "when are exams", "exam dates", "all exams", "exam list"
  ];
  const isTimetable = timetableKeywords.some(kw => lower.includes(kw));
  if (isTimetable) {
    return "timetable";
  }

  // 2. Today's Exam Intent
  const todayKeywords = [
    "today", "inaiku", "inayikku", "this day"
  ];
  const examKeywords = [
    "exam", "exams", "test", "writing", "paper", "subject", "schedule"
  ];
  const batchKeywords = [
    "my batch", "our batch", "my students", "our students", "batch students", "students"
  ];

  const hasToday = todayKeywords.some(kw => lower.includes(kw));
  const hasExam = examKeywords.some(kw => lower.includes(kw));
  const hasBatchOrSelf = batchKeywords.some(kw => lower.includes(kw)) ||
    lower.includes("what is today's exam") ||
    lower.includes("what is todays exam") ||
    lower.includes("which exam") ||
    lower.includes("do my students have");

  if (hasToday && (hasExam || hasBatchOrSelf)) {
    return "today_exam";
  }

  // Common phrases
  if (
    lower.includes("what exam is my batch writing") ||
    lower.includes("which exam do my students have") ||
    lower.includes("what is the exam today") ||
    lower.includes("what is today's exam") ||
    lower.includes("what is todays exam") ||
    lower.includes("do my students have an exam today") ||
    lower.includes("what is my batch exam today") ||
    lower.includes("today exam")
  ) {
    return "today_exam";
  }

  return null;
}

/**
 * Security / Authorization check:
 * Inspects if the tutor explicitly asked for a department or batch DIFFERENT from their assigned one.
 */
function checkTutorSpoofingAttempt(message, tutorDeptNorm, tutorBatchNorm) {
  const lower = String(message || "").toLowerCase();

  // Check department tokens
  const deptsToCheck = [
    { code: "CSE", tokens: ["cse", "computer science"] },
    { code: "IT", tokens: ["\\bit\\b", "information technology"] },
    { code: "AIDS", tokens: ["aids", "ai & ds", "ai and ds", "data science"] },
    { code: "AIML", tokens: ["aiml", "ai & ml", "ai and ml", "machine learning"] },
    { code: "ECE", tokens: ["ece", "electronics and communication"] },
    { code: "EEE", tokens: ["eee", "electrical and electronics"] },
    { code: "MECH", tokens: ["mech", "mechanical"] },
    { code: "CIVIL", tokens: ["civil"] }
  ];

  for (const item of deptsToCheck) {
    if (item.code !== tutorDeptNorm) {
      for (const token of item.tokens) {
        const regex = token.startsWith("\\b") ? new RegExp(token, "i") : new RegExp(`\\b${token}\\b`, "i");
        if (regex.test(lower)) {
          return {
            unauthorized: true,
            targetDept: item.code
          };
        }
      }
    }
  }

  // Check batch tokens (e.g. 2024-2028, 2025-2029, 2026-2030, 2022-2026)
  const batchMatches = lower.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
  if (batchMatches) {
    const requestedBatch = `${batchMatches[1]}-${batchMatches[2]}`;
    if (requestedBatch !== tutorBatchNorm) {
      return {
        unauthorized: true,
        targetBatch: requestedBatch
      };
    }
  }

  // Also check isolated 4-digit batch year like "2024 batch" or "2025 batch"
  const singleYearMatch = lower.match(/\b(20\d{2})\s+batch\b/);
  if (singleYearMatch) {
    const startYear = tutorBatchNorm.split("-")[0];
    if (singleYearMatch[1] !== startYear) {
      return {
        unauthorized: true,
        targetBatch: singleYearMatch[1]
      };
    }
  }

  return { unauthorized: false };
}

/**
 * Main Tutor Matrix AI Query Handler
 * Follows the strict relationship:
 * Logged-in Tutor -> Tutor Department + Batch -> Find Matching Students -> Seat Allocations -> Exams
 */
function handleTutorAiQuery({ tutorId, tenantId, message, masterDb, predictedIntent }, callback) {
  if (!masterDb) {
    return callback(new Error("Master database connection is required"));
  }

  // Step 1: Identify Tutor fresh from database to guarantee security & freshness
  masterDb.get(
    "SELECT * FROM employees WHERE id = ?",
    [tutorId],
    (err, tutorRecord) => {
      if (err) return callback(err);

      if (!tutorRecord) {
        return callback(null, {
          success: true,
          reply: "I couldn't identify your Department and Batch. Please contact the administrator to update your tutor profile."
        });
      }

      const rawBranch = String(tutorRecord.branch || "").trim();
      const rawBatch = String(tutorRecord.batch || "").trim();
      const tutorDegree = String(tutorRecord.degree || "").trim();
      const tutorTenantId = tutorRecord.tenant_id || tenantId || "ccet";

      // Section 9: Missing profile data handling
      if (!rawBranch || !rawBatch) {
        return callback(null, {
          success: true,
          reply: "I couldn't identify your Department and Batch. Please contact the administrator to update your tutor profile."
        });
      }

      const normBranch = normalizeDepartment(rawBranch);
      const normBatch = normalizeBatch(rawBatch);

      // Construct clean display labels (e.g., "B.Tech IT" and "2023–2027")
      let displayDept = rawBranch;
      if (tutorDegree && !rawBranch.toLowerCase().includes(tutorDegree.toLowerCase())) {
        displayDept = `${tutorDegree} ${normBranch}`;
      }
      const displayBatch = rawBatch.includes("–") ? rawBatch : normBatch.replace("-", "–");

      // Section 7: Security / Access Control Check
      const spoofCheck = checkTutorSpoofingAttempt(message, normBranch, normBatch);
      if (spoofCheck.unauthorized) {
        return callback(null, {
          success: true,
          reply: `🔒 **Access Restricted:** As the assigned tutor for **${displayDept} (${displayBatch})**, you are only authorized to view exam information and student allocations for your own department and batch.`
        });
      }

      const intent = predictedIntent === "tutor_timetable" || predictedIntent === "tutor_today_exam"
        ? predictedIntent.replace("tutor_", "")
        : detectTutorIntent(message);
      if (!intent) {
        // Return null to let caller fall back to general assistant response
        return callback(null, null);
      }

      let tenantDb;
      try {
        tenantDb = getTenantDb(tutorTenantId);
      } catch (dbErr) {
        return callback(dbErr);
      }

      // Step 2: Find Matching Students
      // student.department === tutor.department AND student.batch === tutor.batch
      tenantDb.all(
        `SELECT regno, name, dept, batch, degree 
         FROM students 
         WHERE (
           LOWER(TRIM(dept)) = LOWER(TRIM(?))
           OR LOWER(TRIM(dept)) = LOWER(TRIM(?))
         )
         AND (
           REPLACE(REPLACE(batch, '–', '-'), ' ', '') = REPLACE(?, ' ', '')
           OR LOWER(TRIM(batch)) = LOWER(TRIM(?))
         )
         ORDER BY regno ASC`,
        [normBranch, rawBranch, normBatch, rawBatch],
        (errStudents, students) => {
          if (errStudents) return callback(errStudents);

          // Section 9: No students found
          if (!students || students.length === 0) {
            return callback(null, {
              success: true,
              reply: "I couldn't find any students assigned to your Department and Batch."
            });
          }

          const regnos = students.map(s => String(s.regno).trim().replace(/\.0$/, ""));
          const placeholders = regnos.map(() => "?").join(",");

          // Step 3: Check Exam Hall Allocation for those students
          tenantDb.all(
            `SELECT sa.id, sa.regno, sa.name, sa.subject_code, sa.subject_name,
                    sa.hall_no, sa.seat_label, sa.dept, sa.batch, sa.exam_date,
                    sa.session, sa.invigilator,
                    (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code AND (s.dept = sa.dept OR s.dept IS NULL) LIMIT 1) as catalog_subject_name
             FROM seat_allocations sa
             WHERE REPLACE(REPLACE(TRIM(sa.regno), '.0', ''), ' ', '') IN (${placeholders})
             ORDER BY sa.exam_date ASC, sa.session ASC, sa.hall_no ASC, sa.seat_label ASC`,
            regnos,
            (errAlloc, allocations) => {
              if (errAlloc) return callback(errAlloc);

              const rows = allocations || [];

              // ---------------------------------------------------------------
              // TODAY'S EXAM QUERY
              // ---------------------------------------------------------------
              if (intent === "today_exam") {
                const todayVariants = getTodayDateVariants();

                // Filter allocation records for today's date
                const todayAllocations = rows.filter(r => {
                  const cleanDate = String(r.exam_date || "").trim().split("T")[0];
                  return todayVariants.includes(cleanDate);
                });

                if (todayAllocations.length === 0) {
                  // Show other scheduled exams for the batch instead of "no exam today"
                  const upcomingRows = rows.slice(0, 5);
                  let availableInfo = "";
                  if (upcomingRows.length > 0) {
                    const grouped = new Map();
                    for (const r of upcomingRows) {
                      const key = `${r.exam_date}_${r.session}`;
                      if (!grouped.has(key)) grouped.set(key, { exam_date: r.exam_date, session: r.session, subjects: new Set(), halls: new Set() });
                      if (r.subject_code) grouped.get(key).subjects.add(r.subject_code);
                      if (r.hall_no) grouped.get(key).halls.add(r.hall_no);
                    }
                    const lines = Array.from(grouped.values()).map(g =>
                      `  • **${g.exam_date} (${g.session})**: Subjects \`${Array.from(g.subjects).join(", ") || "N/A"}\` — Halls: ${Array.from(g.halls).join(", ") || "Pending"}`
                    ).join("\n");
                    availableInfo = `\n\n**Scheduled Exams for Your Batch (${displayBatch}):**\n${lines}`;
                  } else {
                    availableInfo = `\n\nNo exam seating allocations have been scheduled for **${displayBatch}** yet.`;
                  }
                  return callback(null, {
                    success: true,
                    reply: `📋 **Exam Lookup — ${displayDept} (${displayBatch})**\n\nNo exam allocations found for today's date.${availableInfo}`
                  });
                }

                // Group by subject_code
                const subjectGroups = new Map();
                for (const row of todayAllocations) {
                  const code = row.subject_code || "EXAM";
                  if (!subjectGroups.has(code)) {
                    subjectGroups.set(code, {
                      subjectCode: code,
                      subjectName: row.subject_name || row.catalog_subject_name || "Scheduled Exam",
                      examDate: row.exam_date,
                      session: row.session,
                      halls: new Set(),
                      studentsCount: 0
                    });
                  }
                  const group = subjectGroups.get(code);
                  if (row.hall_no) {
                    group.halls.add(row.hall_no);
                  }
                  group.studentsCount++;
                }

                let reply = "📚 Today's Exam\n\n";
                reply += `Your Batch: ${displayBatch}\n`;
                reply += `Department: ${displayDept}\n\n`;

                const groups = Array.from(subjectGroups.values());
                groups.forEach((g, idx) => {
                  if (idx > 0) reply += "\n---\n\n";
                  const formattedDate = formatExamDate(g.examDate, "long");
                  const formattedTime = formatSessionTime(g.session);
                  const hallsList = Array.from(g.halls).sort();

                  reply += `Subject: ${g.subjectName}\n`;
                  reply += `Subject Code: ${g.subjectCode}\n`;
                  reply += `Date: ${formattedDate}\n`;
                  reply += `Time: ${formattedTime}\n\n`;

                  reply += "Your batch students have been allocated to:\n";
                  if (hallsList.length > 0) {
                    hallsList.forEach(h => {
                      reply += `${h}\n`;
                    });
                  } else {
                    reply += "Hall allocation pending\n";
                  }
                });

                reply += "\nThe students' seating details are available in the exam allocation.";

                return callback(null, {
                  success: true,
                  reply,
                  type: "tutor_today_exam",
                  data: {
                    batch: displayBatch,
                    department: displayDept,
                    exams: groups
                  }
                });
              }

              // ---------------------------------------------------------------
              // BATCH EXAM TIMETABLE QUERY
              // ---------------------------------------------------------------
              if (intent === "timetable") {
                if (rows.length === 0) {
                  return callback(null, {
                    success: true,
                    reply: "Your batch students were found, but no exam hall allocation is currently available."
                  });
                }

                // Group by (exam_date, session, subject_code)
                const timetableMap = new Map();
                for (const row of rows) {
                  const key = `${row.exam_date}_${row.session}_${row.subject_code}`;
                  if (!timetableMap.has(key)) {
                    timetableMap.set(key, {
                      examDate: row.exam_date,
                      session: row.session,
                      subjectCode: row.subject_code,
                      subjectName: row.subject_name || row.catalog_subject_name || "Exam",
                      halls: new Set(),
                      studentsCount: 0
                    });
                  }
                  const item = timetableMap.get(key);
                  if (row.hall_no) {
                    item.halls.add(row.hall_no);
                  }
                  item.studentsCount++;
                }

                // Sort chronologically by date then session
                const timetableEntries = Array.from(timetableMap.values()).sort((a, b) => {
                  const dateCompare = String(a.examDate).localeCompare(String(b.examDate));
                  if (dateCompare !== 0) return dateCompare;
                  return String(a.session).localeCompare(String(b.session));
                });

                let reply = `📅 **Exam Timetable for Your Batch**\n\n`;
                reply += `**Department:** ${displayDept}\n`;
                reply += `**Batch:** ${displayBatch}\n\n`;

                reply += `| Date | Subject Code | Subject | Time | Hall |\n`;
                reply += `| ----------- | ------------ | ------------------- | ------------------ | -------------- |\n`;

                timetableEntries.forEach(entry => {
                  const shortDate = formatExamDate(entry.examDate, "short");
                  const timeStr = formatSessionTime(entry.session);
                  const hallsStr = Array.from(entry.halls).sort().join(", ") || "Assigned";
                  reply += `| ${shortDate} | ${entry.subjectCode} | ${entry.subjectName} | ${timeStr} | ${hallsStr} |\n`;
                });

                reply += `\n*The timetable contains all confirmed seating allocations for your batch students.*`;

                return callback(null, {
                  success: true,
                  reply,
                  type: "tutor_timetable",
                  data: {
                    batch: displayBatch,
                    department: displayDept,
                    timetable: timetableEntries
                  }
                });
              }

              return callback(null, null);
            }
          );
        }
      );
    }
  );
}

module.exports = {
  normalizeDepartment,
  normalizeBatch,
  formatSessionTime,
  formatExamDate,
  detectTutorIntent,
  checkTutorSpoofingAttempt,
  handleTutorAiQuery
};
