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
const resultsMeta = document.getElementById("resultsMeta");
const submissionList = document.getElementById("submissionList");
const submissionDetail = document.getElementById("submissionDetail");

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

function getStudentLink(testId) {
  return `${window.location.origin}/test.html?id=${testId}`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function formatDateTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString();
}

function clearResultsView(message = "Select a test and click View Results.") {
  resultsMeta.textContent = message;
  submissionList.innerHTML = "";
  submissionDetail.innerHTML = "";
  submissionDetail.classList.add("hidden");
}

function renderQuestionForReview(text) {
  return escapeHtml(String(text || "")).replaceAll("\n", "<br>");
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

    const fullLink = getStudentLink(data.testId);
    try {
      await copyText(fullLink);
      adminMessage.textContent = `Saved. Student link copied: ${fullLink}`;
    } catch {
      adminMessage.textContent = `Saved. Share this link: ${fullLink}`;
    }
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

  const testId = Number(target.dataset.id);
  if (!Number.isInteger(testId)) return;

  if (target.classList.contains("copy-link-btn")) {
    const link = getStudentLink(testId);
    try {
      await copyText(link);
      adminMessage.textContent = `Student link copied: ${link}`;
    } catch {
      adminMessage.textContent = `Copy failed. Link: ${link}`;
    }
    return;
  }

  if (target.classList.contains("view-results-btn")) {
    const testTitle = target.dataset.title || `Test ${testId}`;
    await loadSubmissions(testId, testTitle);
    return;
  }

  if (!target.classList.contains("delete-test-btn")) return;

  const ok = window.confirm("Delete this test permanently?");
  if (!ok) return;

  try {
    const response = await fetch(`/api/tests/${testId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete.");
    adminMessage.textContent = `Deleted test ${testId}.`;
    clearResultsView();
    loadTests();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
});

submissionList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("review-submission-btn")) return;

  const submissionId = Number(target.dataset.id);
  if (!Number.isInteger(submissionId)) return;

  try {
    const response = await fetch(`/api/submissions/${submissionId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load review.");

    const summaryClass = data.result === "PASS" ? "correct" : "wrong";
    const summary = `
      <div class="score">
        Student: ${escapeHtml(data.studentName)}<br>
        Test: ${escapeHtml(data.testTitle)}<br>
        Score: ${data.score}/${data.total} (${data.percent}%)<br>
        Pass Mark: ${data.passMark}/${data.total}<br>
        Result: <span class="${summaryClass}">${escapeHtml(data.result)}</span><br>
        Submitted: ${escapeHtml(formatDateTime(data.submittedAt))}
      </div>
    `;

    const reviewHtml = data.review
      .map((item, index) => {
        const selectedText =
          item.selectedIndex === null || item.selectedIndex === undefined
            ? "Not answered"
            : `${"ABCD"[item.selectedIndex]}) ${escapeHtml(item.options[item.selectedIndex] || "-")}`;
        const correctText = `${"ABCD"[item.correctIndex]}) ${escapeHtml(item.options[item.correctIndex] || "-")}`;
        return `
          <div class="review-item">
            <strong>Q${index + 1}. ${renderQuestionForReview(item.question)}</strong>
            <div class="${item.isCorrect ? "correct" : "wrong"}">Student answer: ${selectedText}</div>
            <div class="correct">Correct answer: ${correctText}</div>
          </div>
        `;
      })
      .join("");

    submissionDetail.innerHTML = `${summary}${reviewHtml}`;
    submissionDetail.classList.remove("hidden");
  } catch (error) {
    resultsMeta.textContent = error.message;
  }
});

async function loadSubmissions(testId, testTitle) {
  submissionList.innerHTML = "";
  submissionDetail.innerHTML = "";
  submissionDetail.classList.add("hidden");
  resultsMeta.textContent = `Loading results for ${testTitle}...`;

  try {
    const response = await fetch(`/api/tests/${testId}/submissions`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load results.");

    resultsMeta.textContent = `${data.testTitle} | Pass Mark: ${data.passMark} | Submissions: ${data.submissions.length}`;

    if (data.submissions.length === 0) {
      submissionList.innerHTML = "<li>No student submissions yet.</li>";
      return;
    }

    data.submissions.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(item.studentName)}</strong><br>
        Score: ${item.score}/${item.total} (${item.percent}%) |
        Result: <span class="${item.result === "PASS" ? "correct" : "wrong"}">${item.result}</span><br>
        Submitted: ${escapeHtml(formatDateTime(item.submittedAt))}<br>
        <button type="button" class="review-submission-btn" data-id="${item.id}">Review Answers</button>
      `;
      submissionList.appendChild(li);
    });
  } catch (error) {
    resultsMeta.textContent = error.message;
  }
}

async function loadTests() {
  testsList.innerHTML = "";
  try {
    const response = await fetch("/api/tests");
    const tests = await response.json();
    tests.forEach((t) => {
      const li = document.createElement("li");
      const studentLink = getStudentLink(t.id);
      li.innerHTML = `
        <strong>${escapeHtml(t.title)}</strong><br>
        Test ID: ${t.id} | Timer: ${t.durationMinutes} min | Pass Mark: ${t.passMark}/${t.totalQuestions}<br>
        <a href="/test.html?id=${t.id}" target="_blank" rel="noopener">Open Student Page</a><br>
        <div class="button-row">
          <button type="button" class="copy-link-btn" data-id="${t.id}">Copy Test Link</button>
          <button type="button" class="view-results-btn secondary-btn" data-id="${t.id}" data-title="${escapeHtml(
            t.title
          )}">View Results</button>
          <button type="button" class="delete-test-btn" data-id="${t.id}">Delete Test</button>
        </div>
        <small class="muted">${escapeHtml(studentLink)}</small>
      `;
      testsList.appendChild(li);
    });

    if (tests.length === 0) {
      testsList.innerHTML = "<li>No tests published yet.</li>";
      clearResultsView();
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
clearResultsView();
loadTests();
