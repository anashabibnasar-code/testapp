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
}

function parseQuestionBlock(blockText) {
  const lines = blockText.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && /^\s*Question\s+\d+\b/i.test(lines[0])) {
    lines.shift();
  }

  const questionParts = [];
  const options = [null, null, null, null];
  let currentOption = -1;
  let answerIndex = null;
  let afterAnswer = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00A0/g, " ");
    if (afterAnswer) continue;

    const answerMatch = line.match(/(?:✅\s*)?\bAnswer\s*:\s*([ABCD])\b/i);
    if (answerMatch) {
      answerIndex = "ABCD".indexOf(answerMatch[1].toUpperCase());
      currentOption = -1;
      afterAnswer = true;
      continue;
    }

    const optionMatch = line.match(/^\s*([ABCD])\.\s*(.*)$/i);
    if (optionMatch) {
      currentOption = "ABCD".indexOf(optionMatch[1].toUpperCase());
      options[currentOption] = optionMatch[2].trim();
      continue;
    }

    if (currentOption >= 0 && options[currentOption]) {
      const continuation = line.trim();
      if (continuation) {
        options[currentOption] = `${options[currentOption]} ${continuation}`.trim();
      }
      continue;
    }

    if (/^\s*(ABAP|SAP HANA)\s+Section\s*$/i.test(line)) continue;
    questionParts.push(line);
  }

  const questionTextValue = questionParts.join("\n").trim();
  if (!questionTextValue || options.some((x) => !x) || answerIndex === null) {
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

renderDraft();
loadTests();
