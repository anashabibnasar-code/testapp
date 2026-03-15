const ADMIN_DRAFT_KEY = "test_platform_admin_draft_v1";
const draftQuestions = [];

const testTitleInput = document.getElementById("testTitle");
const durationInput = document.getElementById("durationMinutes");
const passMarkInput = document.getElementById("passMark");
const bulkInput = document.getElementById("bulkInput");
const parseBulkBtn = document.getElementById("parseBulkBtn");

const questionText = document.getElementById("questionText");
const optA = document.getElementById("optA");
const optB = document.getElementById("optB");
const optC = document.getElementById("optC");
const optD = document.getElementById("optD");
const correctIndex = document.getElementById("correctIndex");
const addQuestionBtn = document.getElementById("addQuestionBtn");
const draftQuestionsList = document.getElementById("draftQuestions");
const saveTestBtn = document.getElementById("saveTestBtn");
const testsList = document.getElementById("testsList");
const adminMessage = document.getElementById("adminMessage");

function renderDraft() {
  draftQuestionsList.innerHTML = "";
  if (draftQuestions.length === 0) {
    draftQuestionsList.innerHTML = "<li>No questions yet.</li>";
    return;
  }

  draftQuestions.forEach((q, index) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>Q${index + 1}:</strong> ${escapeHtml(q.question)}<br>Correct: ${"ABCD"[q.answerIndex]}`;
    draftQuestionsList.appendChild(li);
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidDraftQuestion(item) {
  return (
    item &&
    typeof item.question === "string" &&
    Array.isArray(item.options) &&
    item.options.length === 4 &&
    item.options.every((x) => typeof x === "string" && x.trim()) &&
    Number.isInteger(item.answerIndex) &&
    item.answerIndex >= 0 &&
    item.answerIndex <= 3
  );
}

function saveDraftState() {
  const state = {
    title: testTitleInput.value,
    durationMinutes: durationInput.value,
    passMark: passMarkInput.value,
    bulkInput: bulkInput.value,
    questions: draftQuestions,
  };
  localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(state));
}

function loadDraftState() {
  try {
    const raw = localStorage.getItem(ADMIN_DRAFT_KEY);
    if (!raw) return;

    const state = JSON.parse(raw);
    if (state && typeof state.title === "string") testTitleInput.value = state.title;
    if (state && typeof state.durationMinutes === "string") durationInput.value = state.durationMinutes;
    if (state && typeof state.passMark === "string") passMarkInput.value = state.passMark;
    if (state && typeof state.bulkInput === "string") bulkInput.value = state.bulkInput;

    if (state && Array.isArray(state.questions)) {
      const valid = state.questions.filter(isValidDraftQuestion);
      draftQuestions.push(...valid);
      if (valid.length > 0) {
        adminMessage.textContent = `Recovered ${valid.length} unsaved question(s).`;
      }
    }
  } catch {
    // Ignore corrupted local storage and continue.
  }
}

function clearDraftState() {
  localStorage.removeItem(ADMIN_DRAFT_KEY);
}

function addSingleQuestion() {
  const question = questionText.value.trim();
  const options = [optA.value.trim(), optB.value.trim(), optC.value.trim(), optD.value.trim()];
  const answerIndex = Number(correctIndex.value);

  if (!question || options.some((x) => !x)) {
    adminMessage.textContent = "Fill question and all options.";
    return;
  }

  draftQuestions.push({ question, options, answerIndex });
  questionText.value = "";
  optA.value = "";
  optB.value = "";
  optC.value = "";
  optD.value = "";
  correctIndex.value = "0";
  adminMessage.textContent = `Added question ${draftQuestions.length}.`;
  renderDraft();
  saveDraftState();
}

function parseQuestionBlock(blockText) {
  let text = blockText.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  text = text.replace(/^\s*Question\s+\d+\b\s*/i, "");
  let answerIndex = null;

  const answerMatches = [...text.matchAll(/\bAnswer\s*:\s*([ABCD])\b/gi)];
  if (answerMatches.length === 0) return null;

  // Use the last answer in block so "Correct output: Answer: A" overrides earlier answer.
  answerIndex = "ABCD".indexOf(answerMatches[answerMatches.length - 1][1].toUpperCase());

  const firstAnswerPos = answerMatches[0].index || text.length;
  text = text.slice(0, firstAnswerPos);
  text = text.replace(/(^|[^A-Za-z0-9_])([ABCD])\)\s+/g, "$1$2. ");
  text = text.replace(/([^\n])\s*([ABCD])\.\s+/g, "$1\n$2. ");

  const lines = text.split("\n");
  const questionParts = [];
  const options = [null, null, null, null];
  let currentOption = -1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\s*(ABAP|SAP HANA)\s+Section\s*$/i.test(line)) continue;

    const optionMatch = line.match(/^([ABCD])\.\s*(.*)$/i);
    if (optionMatch) {
      currentOption = "ABCD".indexOf(optionMatch[1].toUpperCase());
      const initialText = optionMatch[2].trim();
      options[currentOption] = initialText;
      continue;
    }

    if (currentOption >= 0) {
      options[currentOption] = options[currentOption]
        ? `${options[currentOption]} ${line}`.trim()
        : line;
      continue;
    }

    questionParts.push(line);
  }

  const questionTextValue = questionParts.join("\n").trim();
  if (!questionTextValue || options.some((x) => !x || !x.trim()) || answerIndex === null) {
    return null;
  }

  return {
    question: questionTextValue,
    options,
    answerIndex,
  };
}

function parseBulkQuestions(rawText) {
  const text = rawText.replace(/\r\n/g, "\n");
  const blocks = text.match(/Question\s+\d+\b[\s\S]*?(?=\n\s*Question\s+\d+\b|$)/gi) || [];
  const parsed = [];

  for (const block of blocks) {
    const q = parseQuestionBlock(block);
    if (q) parsed.push(q);
  }

  return parsed;
}

addQuestionBtn.addEventListener("click", addSingleQuestion);

parseBulkBtn.addEventListener("click", () => {
  const raw = bulkInput.value.trim();
  if (!raw) {
    adminMessage.textContent = "Paste bulk text first.";
    return;
  }

  const parsed = parseBulkQuestions(raw);
  if (parsed.length === 0) {
    adminMessage.textContent =
      "Could not parse questions. Use format: Question X + A/B/C/D + Answer: B.";
    return;
  }

  draftQuestions.push(...parsed);
  bulkInput.value = "";
  adminMessage.textContent = `Parsed and added ${parsed.length} questions.`;
  renderDraft();
  saveDraftState();
});

saveTestBtn.addEventListener("click", async () => {
  const title = testTitleInput.value.trim();
  const durationMinutes = Number(durationInput.value);
  const passMark = Number(passMarkInput.value);

  if (!title || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
    adminMessage.textContent = "Enter valid title and timer.";
    return;
  }
  if (!Number.isInteger(passMark) || passMark < 1) {
    adminMessage.textContent = "Enter valid pass mark.";
    return;
  }
  if (draftQuestions.length === 0) {
    adminMessage.textContent = "Add at least one question.";
    return;
  }
  if (passMark > draftQuestions.length) {
    adminMessage.textContent = "Pass mark cannot be greater than total questions.";
    return;
  }

  const payload = {
    title,
    durationMinutes,
    passMark,
    questions: draftQuestions,
  };

  try {
    const response = await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save test.");

    adminMessage.textContent = `Saved. Share this link: /test.html?id=${data.testId}`;
    draftQuestions.length = 0;
    renderDraft();
    clearDraftState();
    loadTests();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

testsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("delete-test-btn")) return;

  const testId = Number(target.dataset.id);
  if (!Number.isInteger(testId)) return;

  const ok = window.confirm("Delete this test permanently?");
  if (!ok) return;

  try {
    const response = await fetch(`/api/tests/${testId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete.");
    adminMessage.textContent = `Deleted test ${testId}.`;
    loadTests();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

async function loadTests() {
  testsList.innerHTML = "";
  try {
    const response = await fetch("/api/tests");
    const tests = await response.json();
    tests.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(t.title)}</strong><br>
        Test ID: ${t.id} | Timer: ${t.durationMinutes} min | Pass Mark: ${t.passMark}/${t.totalQuestions}<br>
        <a href="/test.html?id=${t.id}" target="_blank" rel="noopener">Open Student Link</a><br>
        <button type="button" class="delete-test-btn" data-id="${t.id}">Delete Test</button>
      `;
      testsList.appendChild(li);
    });

    if (tests.length === 0) {
      testsList.innerHTML = "<li>No tests published yet.</li>";
    }
  } catch {
    testsList.innerHTML = "<li>Failed to load tests.</li>";
  }
}

[
  testTitleInput,
  durationInput,
  passMarkInput,
  bulkInput,
  questionText,
  optA,
  optB,
  optC,
  optD,
].forEach((el) => {
  el.addEventListener("input", saveDraftState);
});
correctIndex.addEventListener("change", saveDraftState);

loadDraftState();
renderDraft();
loadTests();
