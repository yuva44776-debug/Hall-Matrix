// utils/allocationLogic.js

/**
 * EXAM HALL SEATING ALLOCATION ENGINE
 * 
 * Rules:
 * 1. Each hall contains 24 seats arranged in a 4 rows x 6 columns grid.
 *    Rows: A, B, C, D
 *    Columns: 1, 2, 3, 4, 5, 6
 *    Seats: A1..A6, B1..B6, C1..C6, D1..D6
 * 2. Mapping key: Department + Batch + Subject Code
 * 3. Strict Orthogonal Adjacency Rule:
 *    For every occupied seat, its Left, Right, Front, and Back neighbors
 *    must NOT have the same Department + Subject Code.
 * 4. Multi-Hall: When total students exceed 24, allocate across multiple halls,
 *    distributing subjects evenly/interleaved and satisfying the rule independently.
 * 5. Pre-save validation pass ensures 100% compliance.
 */

const ROWS = 4; // Row A, Row B, Row C, Row D
const COLS = 6; // Col 1, Col 2, Col 3, Col 4, Col 5, Col 6
const SEATS_PER_HALL = 24;
const ROW_LETTERS = ["A", "B", "C", "D"];

/**
 * Returns canonical seat label, e.g. (0, 0) -> "A1", (2, 3) -> "C4"
 */
function seatLabel(r, c) {
  return ROW_LETTERS[r] + (c + 1);
}

/**
 * Generates composite key for adjacency checking: Department + Subject Code
 */
function getStudentKey(student) {
  if (!student) return "";
  const dept = String(student.dept || "").trim().toUpperCase();
  const sub = String(student.subject_code || "").trim().toUpperCase();
  return `${dept}::${sub}`;
}

/**
 * Validation pass: checks every occupied seat's Left, Right, Front, Back neighbors.
 * Returns { valid: true } or { valid: false, reason, seat, neighborSeat }
 */
function validateAllocationGrid(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const current = grid[r][c];
      if (!current) continue;
      const currentKey = getStudentKey(current);

      const neighbors = [
        { name: "Left", r, c: c - 1 },
        { name: "Right", r, c: c + 1 },
        { name: "Front", r: r - 1, c },
        { name: "Back", r: r + 1, c },
      ];

      for (const n of neighbors) {
        if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
          const neighborStudent = grid[n.r][n.c];
          if (neighborStudent) {
            const neighborKey = getStudentKey(neighborStudent);
            if (neighborKey === currentKey) {
              return {
                valid: false,
                reason: `Seat ${seatLabel(r, c)} (${current.dept} - ${current.subject_code}) has ${n.name} neighbor ${seatLabel(n.r, n.c)} belonging to the same Department and Subject Code.`,
                seat: seatLabel(r, c),
                neighborSeat: seatLabel(n.r, n.c),
              };
            }
          }
        }
      }
    }
  }
  return { valid: true };
}

/**
 * Solves a single hall grid (4 x 6) for up to 24 students using constraint satisfaction
 * and randomized restart heuristics.
 */
function arrangeHallGrid(hallStudents, maxAttempts = 100) {
  if (!hallStudents || hallStudents.length === 0) {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  const allSeatCoords = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      allSeatCoords.push({ r, c });
    }
  }

  const distinctDepts = new Set(hallStudents.map((s) => String(s.dept || "").trim().toUpperCase())).size;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    let pool = [...hallStudents];

    // Attempt 0: Preserve exact round-robin interleaved order from buckets (canonical good arrangement)
    // Attempt > 0: Random shuffle to explore alternative permutations
    if (attempt > 0) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }

    // Enforce horizontal department alternation on early attempts if multiple depts exist
    const enforceDeptSeparation = distinctDepts > 1 && attempt < Math.floor(maxAttempts * 0.6);

    function isSafe(r, c, candidate) {
      const k = getStudentKey(candidate);
      const candDept = String(candidate.dept || "").trim().toUpperCase();

      // Rule 1 (Strict Exam Rule): No identical department + subject code adjacent (orthogonally)
      if (r > 0 && grid[r - 1][c] && getStudentKey(grid[r - 1][c]) === k) return false;
      if (r < ROWS - 1 && grid[r + 1][c] && getStudentKey(grid[r + 1][c]) === k) return false;
      if (c > 0 && grid[r][c - 1] && getStudentKey(grid[r][c - 1]) === k) return false;
      if (c < COLS - 1 && grid[r][c + 1] && getStudentKey(grid[r][c + 1]) === k) return false;

      // Rule 2 (Good Arrangement Pattern): In the same bench/row, horizontal neighbors alternate departments
      if (enforceDeptSeparation) {
        if (c > 0 && grid[r][c - 1] && String(grid[r][c - 1].dept || "").trim().toUpperCase() === candDept) return false;
        if (c < COLS - 1 && grid[r][c + 1] && String(grid[r][c + 1].dept || "").trim().toUpperCase() === candDept) return false;
      }

      return true;
    }

    // Row-major order preserves natural left-to-right bench interleaving
    let seatOrder = allSeatCoords;
    if (attempt > 10 && attempt % 3 === 1) {
      seatOrder = [...allSeatCoords].sort((a, b) => ((a.r + a.c) % 2) - ((b.r + b.c) % 2));
    }

    let nodeCount = 0;
    const MAX_NODES = 25000;

    function backtrack(seatIndex, remaining) {
      if (remaining.length === 0) return true;
      if (seatIndex >= seatOrder.length) return false;
      if (++nodeCount > MAX_NODES) return false;

      const { r, c } = seatOrder[seatIndex];
      const triedKeys = new Set();

      for (let i = 0; i < remaining.length; i++) {
        const student = remaining[i];
        const k = getStudentKey(student);
        if (triedKeys.has(k)) continue;
        triedKeys.add(k);

        if (isSafe(r, c, student)) {
          grid[r][c] = student;
          remaining.splice(i, 1);

          if (backtrack(seatIndex + 1, remaining)) return true;

          remaining.splice(i, 0, student);
          grid[r][c] = null;
        }
      }

      if (seatOrder.length - (seatIndex + 1) >= remaining.length) {
        if (backtrack(seatIndex + 1, remaining)) return true;
      }

      return false;
    }

    const solved = backtrack(0, pool);
    if (solved) {
      const v = validateAllocationGrid(grid);
      if (v.valid) {
        return grid;
      }
    }
  }

  throw new Error("Unable to place all students in hall while satisfying strict non-adjacent Department + Subject Code rule. Ensure diverse subject distribution or allocate into additional halls.");
}

function allocateExamSeating(subjectBuckets, halls) {
  // Deep clone buckets to avoid mutating original arrays
  const buckets = subjectBuckets.map((b) => ({
    subject_code: b.subject_code,
    subject_name: b.subject_name || "",
    dept: b.dept,
    batch: b.batch,
    students: [...(b.students || [])]
  }));

  const totalStudents = buckets.reduce((acc, b) => acc + b.students.length, 0);
  if (totalStudents === 0) return [];

  const allocations = [];
  let hallIndex = 0;

  while (buckets.some((b) => b.students.length > 0)) {
    const hall = halls[hallIndex];
    if (!hall) {
      throw new Error(`Insufficient exam hall capacity. ${buckets.reduce((acc, b) => acc + b.students.length, 0)} students remain unallocated. Please configure additional halls.`);
    }

    // Each hall has exactly 24 seats in a 4 x 6 grid
    const hallCapacity = SEATS_PER_HALL;
    const hallStudents = [];

    // Interleave students into this hall in a balanced, round-robin manner
    let hasMore = true;
    while (hallStudents.length < hallCapacity && hasMore) {
      hasMore = false;
      for (const bucket of buckets) {
        if (bucket.students.length > 0 && hallStudents.length < hallCapacity) {
          // Cap a single subject at Math.floor(hallCapacity / 2) if other subjects have students remaining
          const currentCount = hallStudents.filter(
            (s) => getStudentKey(s) === `${bucket.dept}::${bucket.subject_code}`
          ).length;
          const otherSubjectsHaveStudents = buckets.some(
            (b) => b !== bucket && b.students.length > 0
          );

          if (otherSubjectsHaveStudents && currentCount >= Math.floor(hallCapacity / 2)) {
            continue;
          }

          const st = bucket.students.shift();
          hallStudents.push({
            ...st,
            dept: bucket.dept,
            batch: bucket.batch,
            subject_code: bucket.subject_code,
            subject_name: bucket.subject_name,
          });
          hasMore = true;
        }
      }
    }

    // Arrange the hall in 4 rows x 6 columns
    const grid = arrangeHallGrid(hallStudents);

    // Pre-save validation check
    const validation = validateAllocationGrid(grid);
    if (!validation.valid) {
      throw new Error(`Allocation validation failed for Hall ${hall.hall_no}: ${validation.reason}`);
    }

    // Flatten grid into allocations
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const student = grid[r][c];
        if (student) {
          allocations.push({
            regno: student.regno,
            name: student.name || null,
            dept: student.dept,
            batch: student.batch || null,
            subject_code: student.subject_code,
            subject_name: student.subject_name || "",
            hall_no: hall.hall_no,
            seat_label: seatLabel(r, c),
            grid_row: r,
            grid_col: c,
            student,
          });
        }
      }
    }

    hallIndex++;
  }

  return allocations;
}

// Backward compatibility alias
function allocateBySubjectHallWise(allocatedStudents, halls) {
  // Group students by dept + subject_code + batch
  const groups = new Map();
  allocatedStudents.forEach((s) => {
    const key = `${s.dept || "GEN"}__${s.batch || "GEN"}__${s.subject_code}`;
    if (!groups.has(key)) {
      groups.set(key, {
        subject_code: s.subject_code,
        subject_name: s.subject_name || "",
        dept: s.dept || "GENERAL",
        batch: s.batch || "",
        students: [],
      });
    }
    groups.get(key).students.push(s);
  });

  return allocateExamSeating(Array.from(groups.values()), halls);
}

module.exports = {
  ROWS,
  COLS,
  SEATS_PER_HALL,
  ROW_LETTERS,
  seatLabel,
  getStudentKey,
  validateAllocationGrid,
  arrangeHallGrid,
  allocateExamSeating,
  allocateBySubjectHallWise,
};
