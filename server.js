const path = require("path");
const express = require("express");
const { initDb, run, get, all } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function pick(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeTestRow(row) {
  return {
    id: toNumber(pick(row, "id"), 0),
    title: String(pick(row, "title") || ""),
    durationMinutes: toNumber(pick(row, "durationMinutes", "durationminutes", "duration_minutes"), 0),
    passMark: toNumber(pick(row, "passMark", "passmark", "pass_mark"), 1),
    createdAt: pick(row, "createdAt", "createdat", "created_at") || null,
    totalQuestions: toNumber(pick(row, "totalQuestions", "totalquestions"), 0),
  };
}

app.get("/api/tests", async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         t.id,
         t.title,
         t.duration_minutes AS durationMinutes,
         t.pass_mark AS passMark,
         t.created_at AS createdAt,
         (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) AS totalQuestions
       FROM tests t
       ORDER BY t.id DESC`
    );
    const tests = rows.map(normalizeTestRow);
    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tests." });
  }
});

app.post("/api/tests", async (req, res) => {
  const { title, durationMinutes, passMark, questions } = req.body;

  if (
    !title ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(passMark) ||
    passMark <= 0 ||
    !Array.isArray(questions) ||
    questions.length === 0
  ) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  if (passMark > questions.length) {
    return res.status(400).json({ error: "Pass mark cannot be greater than total questions." });
  }

  const invalidQuestion = questions.some((q) => {
    return (
      !q ||
      typeof q.question !== "string" ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      !Number.isInteger(q.answerIndex) ||
      q.answerIndex < 0 ||
      q.answerIndex > 3 ||
      q.options.some((opt) => typeof opt !== "string" || !opt.trim())
    );
  });

  if (invalidQuestion) {
    return res.status(400).json({ error: "Invalid question format." });
  }

  try {
    const createdAt = new Date().toISOString();
    const testResult = await run(
      `INSERT INTO tests (title, duration_minutes, pass_mark, created_at) VALUES (?, ?, ?, ?)`,
      [title.trim(), durationMinutes, passMark, createdAt]
    );

    for (const q of questions) {
      await run(
        `INSERT INTO questions (test_id, text, option_a, option_b, option_c, option_d, correct_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          testResult.id,
          q.question.trim(),
          q.options[0].trim(),
          q.options[1].trim(),
          q.options[2].trim(),
          q.options[3].trim(),
          q.answerIndex,
        ]
      );
    }

    res.status(201).json({ testId: testResult.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create test." });
  }
});

app.get("/api/tests/:id", async (req, res) => {
  const testId = Number(req.params.id);
  if (!Number.isInteger(testId)) return res.status(400).json({ error: "Invalid test id." });

  try {
    const test = await get(
      `SELECT id, title, duration_minutes AS durationMinutes, pass_mark AS passMark FROM tests WHERE id = ?`,
      [testId]
    );
    if (!test) return res.status(404).json({ error: "Test not found." });
    const normalizedTest = normalizeTestRow(test);

    const questions = await all(
      `SELECT id, text, option_a, option_b, option_c, option_d FROM questions WHERE test_id = ? ORDER BY id ASC`,
      [testId]
    );

    const formatted = questions.map((q) => ({
      id: q.id,
      question: q.text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
    }));

    res.json({
      id: normalizedTest.id,
      title: normalizedTest.title,
      durationMinutes: normalizedTest.durationMinutes,
      passMark: normalizedTest.passMark,
      questions: formatted,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load test." });
  }
});

app.delete("/api/tests/:id", async (req, res) => {
  const testId = Number(req.params.id);
  if (!Number.isInteger(testId)) return res.status(400).json({ error: "Invalid test id." });

  try {
    await run(`DELETE FROM submissions WHERE test_id = ?`, [testId]);
    await run(`DELETE FROM questions WHERE test_id = ?`, [testId]);
    const result = await run(`DELETE FROM tests WHERE id = ?`, [testId]);

    if (result.changes === 0) return res.status(404).json({ error: "Test not found." });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete test." });
  }
});

app.post("/api/tests/:id/start", async (req, res) => {
  const testId = Number(req.params.id);
  const studentName = String(req.body.studentName || "").trim();

  if (!Number.isInteger(testId) || !studentName) {
    return res.status(400).json({ error: "Invalid test id or student name." });
  }

  try {
    const rawTest = await get(
      `SELECT id, duration_minutes AS durationMinutes, pass_mark AS passMark FROM tests WHERE id = ?`,
      [testId]
    );
    if (!rawTest) return res.status(404).json({ error: "Test not found." });
    const test = normalizeTestRow(rawTest);

    const startedAt = Date.now();
    const result = await run(
      `INSERT INTO submissions (test_id, student_name, started_at) VALUES (?, ?, ?)`,
      [testId, studentName, startedAt]
    );

    res.json({
      submissionId: result.id,
      startedAt,
      durationMinutes: test.durationMinutes,
      passMark: test.passMark,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to start test." });
  }
});

app.post("/api/tests/:id/submit", async (req, res) => {
  const testId = Number(req.params.id);
  const submissionId = Number(req.body.submissionId);
  const answers = req.body.answers;

  if (!Number.isInteger(testId) || !Number.isInteger(submissionId) || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  try {
    const rawTest = await get(
      `SELECT id, title, duration_minutes AS durationMinutes, pass_mark AS passMark FROM tests WHERE id = ?`,
      [testId]
    );
    if (!rawTest) return res.status(404).json({ error: "Test not found." });
    const test = normalizeTestRow(rawTest);

    const submission = await get(`SELECT * FROM submissions WHERE id = ? AND test_id = ?`, [submissionId, testId]);
    if (!submission) return res.status(404).json({ error: "Submission not found." });
    if (submission.submitted_at) return res.status(400).json({ error: "Already submitted." });

    const now = Date.now();
    const allowedMs = test.durationMinutes * 60 * 1000;
    if (now - submission.started_at > allowedMs + 5000) {
      return res.status(400).json({ error: "Time is over. Submission rejected." });
    }

    const questions = await all(
      `SELECT id, text, option_a, option_b, option_c, option_d, correct_index FROM questions WHERE test_id = ? ORDER BY id ASC`,
      [testId]
    );

    const answerMap = new Map();
    for (const item of answers) {
      if (item && Number.isInteger(item.questionId) && Number.isInteger(item.selectedIndex)) {
        answerMap.set(item.questionId, item.selectedIndex);
      }
    }

    let score = 0;
    const review = questions.map((q) => {
      const selectedIndex = answerMap.has(q.id) ? answerMap.get(q.id) : null;
      const isCorrect = selectedIndex === q.correct_index;
      if (isCorrect) score += 1;
      return {
        questionId: q.id,
        question: q.text,
        options: [q.option_a, q.option_b, q.option_c, q.option_d],
        selectedIndex,
        correctIndex: q.correct_index,
        isCorrect,
      };
    });

    const submittedAt = Date.now();
    await run(
      `UPDATE submissions SET submitted_at = ?, score = ?, total = ?, answers_json = ? WHERE id = ?`,
      [submittedAt, score, questions.length, JSON.stringify(review), submissionId]
    );

    const result = score >= test.passMark ? "PASS" : "FAIL";

    res.json({
      testTitle: test.title,
      score,
      total: questions.length,
      passMark: test.passMark,
      result,
      percent: Math.round((score / Math.max(questions.length, 1)) * 100),
      review,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit test." });
  }
});

app.get("/", (req, res) => {
  res.redirect("/admin.html");
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database init failed", error);
    process.exit(1);
  });
