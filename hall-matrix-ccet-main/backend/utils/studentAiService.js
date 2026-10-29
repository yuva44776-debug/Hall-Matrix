// backend/utils/studentAiService.js
const fs = require("fs");
const path = require("path");
const { getTenantDb, dbDir } = require("./tenantDb");

/**
 * Detects if the user query is asking for exam hall, seat, room, or seating location.
 */
function detectStudentHallQueryIntent(message) {
  if (!message || typeof message !== "string") return false;
  const msg = message.toLowerCase().trim();

  // Pattern checks
  const patterns = [
    /where\s+is\s+my\s+(hall|seat|room|desk|table|exam\s+hall|exam\s+room)/i,
    /where\s+is\s+(the\s+)?(hall|seat|room)/i,
    /where\s+(do|should|can)\s+i\s+(sit|write|go)/i,
    /where\s+to\s+sit/i,
    /what\s+is\s+my\s+(hall|seat|room|hall\s+number|seat\s+number|seat\s+label)/i,
    /which\s+(hall|seat|room)\s+(am\s+i|is\s+mine|do\s+i)/i,
    /find\s+my\s+(hall|seat|room)/i,
    /my\s+(hall|seat|room)\s+(number|details|location)?/i,
    /hall\s+number/i,
    /seat\s+number/i,
    /seat\s+label/i,
    /hall\s+location/i,
    /where\s+my\s+(hall|seat)/i,
    /enga\s+enoda\s+(hall|seat)/i,
    /hall\s+enga/i,
    /seat\s+enga/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(msg)) return true;
  }

  // Exact phrase lookups
  const phrases = [
    "where is my hall",
    "where is my seat",
    "where is my room",
    "where is my exam",
    "what is my hall",
    "what is my seat",
    "what is my hall number",
    "what is my seat number",
    "find my hall",
    "find my seat",
    "my hall",
    "my seat",
    "hall number",
    "seat number",
    "where to sit"
  ];

  return phrases.some(p => msg.includes(p));
}

/**
 * Detects if query is asking for student personal details, tutor, department, or subjects.
 */
function detectStudentProfileQueryIntent(message) {
  if (!message || typeof message !== "string") return false;
  const msg = message.toLowerCase().trim();
  const patterns = [
    /who\s+is\s+my\s+(tutor|advisor|mentor|faculty)/i,
    /my\s+(tutor|advisor|mentor|faculty)/i,
    /what\s+is\s+my\s+(dept|department|batch|degree|regno|register\s+number|semester)/i,
    /what\s+are\s+my\s+subjects/i,
    /my\s+subjects/i,
    /my\s+details/i,
    /my\s+profile/i,
    /show\s+my\s+(details|profile|info)/i,
    /student\s+details/i
  ];
  return patterns.some(p => p.test(msg));
}

/**
 * Extracts a candidate student register number from user message.
 * Excludes years like 2024, 2025, 2026, 2027.
 */
function extractRegNoFromMessage(message) {
  if (!message || typeof message !== "string") return null;

  // First check explicit prefixes like "regno: 100000000001" or "reg 100000000001"
  const prefixMatch = message.match(/\b(?:reg(?:no)?|register(?:\s+no)?|roll(?:\s+no)?)\s*[:=\-]?\s*([0-9a-zA-Z]{5,15})\b/i);
  if (prefixMatch) {
    return prefixMatch[1].trim();
  }

  // Check 12-digit standard register numbers
  const twelveDigitMatch = message.match(/\b\d{12}\b/);
  if (twelveDigitMatch) {
    return twelveDigitMatch[0];
  }

  // Check 5-15 digit numbers (excluding 4-digit years)
  const tokens = message.match(/\b[A-Za-z0-9]{5,15}\b/g);
  if (tokens) {
    for (const tok of tokens) {
      if (/^\d{5,15}$/.test(tok)) {
        if (!/^(19|20)\d{2}$/.test(tok)) {
          return tok;
        }
      }
    }
  }

  return null;
}

/**
 * Finds student across tenant databases if tenant is unspecified.
 */
function findStudentRecordAcrossTenants(loginId, preferredTenantId, callback) {
  let files = [];
  try {
    files = fs.readdirSync(dbDir).filter(f => f.startsWith("tenant_") && f.endsWith(".db"));
  } catch {
    files = [];
  }
  const allTenants = files.map(f => f.replace(/^tenant_/, "").replace(/\.db$/, ""));

  const tenantOrder = [];
  if (preferredTenantId && allTenants.includes(preferredTenantId)) {
    tenantOrder.push(preferredTenantId);
  }
  if (allTenants.includes("9203") && !tenantOrder.includes("9203")) {
    tenantOrder.push("9203");
  }
  if (allTenants.includes("ccet") && !tenantOrder.includes("ccet")) {
    tenantOrder.push("ccet");
  }
  for (const tid of allTenants) {
    if (!tenantOrder.includes(tid)) {
      tenantOrder.push(tid);
    }
  }

  const cleanId = String(loginId).trim().toLowerCase().replace(/\.0$/, "");

  let index = 0;
  function tryNext() {
    if (index >= tenantOrder.length) {
      return callback(null, null, null);
    }
    const currentTid = tenantOrder[index++];
    let currentDb;
    try {
      currentDb = getTenantDb(currentTid);
    } catch {
      return tryNext();
    }

    currentDb.get(
      "SELECT * FROM students WHERE LOWER(TRIM(REPLACE(regno, '.0', ''))) = ? OR LOWER(TRIM(COALESCE(username, ''))) = ?",
      [cleanId, cleanId],
      (err, studentRow) => {
        if (err || !studentRow) {
          return tryNext();
        }
        return callback(null, studentRow, currentTid, currentDb);
      }
    );
  }

  tryNext();
}

/**
 * Formats exam session description with timings.
 */
function formatSessionDescription(session) {
  const s = String(session || "").trim().toUpperCase();
  if (s === "FN" || s.startsWith("FORE")) {
    return "Forenoon (FN Session: 09:30 AM - 12:30 PM)";
  }
  if (s === "AN" || s.startsWith("AFTER")) {
    return "Afternoon (AN Session: 01:30 PM - 04:30 PM)";
  }
  return s || "Scheduled Session";
}

/**
 * Main Student Hall & Seat AI Handler.
 * Analyzes Register Number, Department, Batch, and Subject Code,
 * finds the student's allocated exam hall and seat number,
 * and replies with hall location and seating details.
 */
function handleStudentHallQuery(
  { studentSession, requestedRegNo, tenantId, tenantDb, masterDb, message },
  callback
) {
  const isLoggedStudent = !!studentSession;
  const targetRegNo = (isLoggedStudent ? studentSession.regno : null) || requestedRegNo || extractRegNoFromMessage(message);

  // Case 1: Not logged in and no Register Number supplied
  if (!targetRegNo) {
    return callback(null, {
      success: true,
      type: "student_portal_prompt",
      reply:
        "📍 **Student Exam Hall & Seat Finder**\n\n" +
        "To find your allocated exam hall and seat number, please:\n\n" +
        "1. 🎓 **[Log in to the Student Portal](/student/login)** with your 12-digit Register Number and Password.\n" +
        "2. Or ask me with your Register Number directly (e.g. *\"Where is my hall for 100000000001?\"*).\n\n" +
        "💡 *Matrix AI will immediately analyze your **Register Number**, **Department**, **Batch**, and **Subject Code** to reveal your allocated **Hall Number** and **Seat Number**!*",
      action: "student_login_required"
    });
  }

  const cleanRegNo = String(targetRegNo).trim().replace(/\.0$/, "");
  const preferredTid = (studentSession && studentSession.tenant_id) || tenantId || "ccet";

  // Helper to process student once tenant database and student row are resolved
  function processStudentWithDb(resolvedDb, studentRecord, resolvedTid) {
    const student = {
      regno: cleanRegNo,
      name: (studentRecord && studentRecord.name) || (studentSession && studentSession.name) || `Student ${cleanRegNo}`,
      dept: (studentRecord && studentRecord.dept) || (studentSession && studentSession.dept) || "N/A",
      batch: (studentRecord && studentRecord.batch) || (studentSession && studentSession.batch) || "N/A",
      degree: (studentRecord && studentRecord.degree) || (studentSession && studentSession.degree) || "N/A",
      subject_code: (studentRecord && studentRecord.subject_code) || (studentSession && studentSession.subject_code) || "N/A",
      tenant_id: resolvedTid || preferredTid
    };

    // Query seat allocations joined with halls table for location/block info
    const allocQuery = `
      SELECT sa.regno, sa.name, sa.subject_code, sa.hall_no,
             sa.seat_label, sa.dept, sa.batch, sa.exam_date, sa.session,
             COALESCE(NULLIF(sa.subject_name, ''), (SELECT s.subject_name FROM subjects s WHERE s.subject_code = sa.subject_code LIMIT 1), 'Scheduled Exam') as subject_name,
             h.block as hall_block,
             h.capacity as hall_capacity
      FROM seat_allocations sa 
      LEFT JOIN halls h ON UPPER(TRIM(h.hall_no)) = UPPER(TRIM(sa.hall_no))
      WHERE LOWER(TRIM(REPLACE(sa.regno, '.0', ''))) = LOWER(TRIM(?))
      ORDER BY sa.exam_date, sa.session
    `;

    resolvedDb.all(allocQuery, [cleanRegNo], (err, rows) => {
      if (err) {
        console.error("Error retrieving student seat allocation:", err);
        return callback(err);
      }

      // Check if student has allocations
      if (rows && rows.length > 0) {
        const first = rows[0];
        // Enriched student details from allocation if missing
        if (student.dept === "N/A" && first.dept) student.dept = first.dept;
        if (student.batch === "N/A" && first.batch) student.batch = first.batch;
        if (student.subject_code === "N/A" && first.subject_code) student.subject_code = first.subject_code;

        // Construct analysis response
        let reply = `🎯 **Student Exam Hall & Seating Analysis**\n\n`;
        reply += `📋 **Student Profile Analyzed:**\n`;
        reply += `• **Register Number:** \`${student.regno}\`\n`;
        reply += `• **Student Name:** **${student.name}**\n`;
        reply += `• **Department:** **${student.dept}**\n`;
        reply += `• **Batch:** **${student.batch}**\n`;
        reply += `• **Subject Code:** \`${student.subject_code}\`${first.subject_name ? ` (${first.subject_name})` : ""}\n\n`;

        reply += `📍 **Allocated Exam Hall & Seat Details:**\n`;

        rows.forEach((r, idx) => {
          const blockInfo = r.hall_block ? ` (Block ${r.hall_block})` : "";
          const sessionDesc = formatSessionDescription(r.session);

          reply += `🏛️ **Hall Number:** \`${r.hall_no}\`${blockInfo}\n`;
          reply += `🪑 **Seat Number / Label:** \`${r.seat_label}\`\n`;
          reply += `📚 **Subject Code:** \`${r.subject_code}\` (${r.subject_name || "Exam"})\n`;
          reply += `📅 **Exam Date & Session:** ${r.exam_date} • ${sessionDesc}\n`;

          if (r.hall_block) {
            reply += `📍 **Location Guidance:** Hall **${r.hall_no}** is located in **Block ${r.hall_block}**. Please occupy Seat **${r.seat_label}**.\n`;
          } else {
            reply += `📍 **Location Guidance:** Please proceed to Hall **${r.hall_no}** and take your assigned Seat **${r.seat_label}**.\n`;
          }

          if (idx < rows.length - 1) {
            reply += `\n---\n\n`;
          }
        });

        return callback(null, {
          success: true,
          type: "student_hall_allocation",
          reply,
          student,
          allocations: rows.map(r => ({
            hall_no: r.hall_no,
            seat_label: r.seat_label,
            seat_number: r.seat_label,
            block: r.hall_block || null,
            subject_code: r.subject_code,
            subject_name: r.subject_name,
            dept: r.dept || student.dept,
            batch: r.batch || student.batch,
            exam_date: r.exam_date,
            session: r.session
          }))
        });
      }

      // If no active seat allocation found, check if subject exists in curriculum/subjects
      resolvedDb.get(
        "SELECT * FROM subjects WHERE subject_code = ? LIMIT 1",
        [student.subject_code],
        (subErr, subRow) => {
          const subName = subRow ? subRow.subject_name : null;

          let reply = `🎯 **Student Seating Analysis**\n\n`;
          reply += `📋 **Student Profile Analyzed:**\n`;
          reply += `• **Register Number:** \`${student.regno}\`\n`;
          reply += `• **Student Name:** **${student.name}**\n`;
          reply += `• **Department:** **${student.dept}**\n`;
          reply += `• **Batch:** **${student.batch}**\n`;
          reply += `• **Registered Subject Code:** \`${student.subject_code}\`${subName ? ` (${subName})` : ""}\n\n`;

          reply += `⚠️ **Seating Status:**\n`;
          reply += `No active hall seating allocation has been confirmed yet for Register Number \`${student.regno}\`.\n\n`;
          reply += `📌 *The examination coordinators are currently scheduling and verifying hall arrangements. Once confirmed, your allocated **Hall Number** and **Seat Number** will appear here automatically!*`;

          return callback(null, {
            success: true,
            type: "student_hall_allocation",
            reply,
            student,
            allocations: []
          });
        }
      );
    });
  }

  // Lookup student in the designated tenant or across tenants
  if (tenantDb) {
    tenantDb.get(
      "SELECT * FROM students WHERE LOWER(TRIM(REPLACE(regno, '.0', ''))) = ?",
      [cleanRegNo.toLowerCase()],
      (err, studentRow) => {
        if (studentRow) {
          return processStudentWithDb(tenantDb, studentRow, preferredTid);
        }

        // Fallback: search across other tenants
        findStudentRecordAcrossTenants(cleanRegNo, preferredTid, (crossErr, crossRow, matchedTid, matchedDb) => {
          if (crossRow && matchedDb) {
            return processStudentWithDb(matchedDb, crossRow, matchedTid);
          }
          // If no student record exists, still check seat_allocations in current tenantDb
          return processStudentWithDb(tenantDb, null, preferredTid);
        });
      }
    );
  } else {
    findStudentRecordAcrossTenants(cleanRegNo, preferredTid, (crossErr, crossRow, matchedTid, matchedDb) => {
      const activeDb = matchedDb || getTenantDb(preferredTid);
      return processStudentWithDb(activeDb, crossRow, matchedTid || preferredTid);
    });
  }
}

module.exports = {
  detectStudentHallQueryIntent,
  detectStudentProfileQueryIntent,
  extractRegNoFromMessage,
  handleStudentHallQuery
};
