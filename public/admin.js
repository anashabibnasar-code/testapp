const draftQuestions = [];

const testTitleInput = document.getElementById("testTitle");
const durationInput = document.getElementById("durationMinutes");
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
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

addQuestionBtn.addEventListener("click", () => {
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
});

saveTestBtn.addEventListener("click", async () => {
  const title = testTitleInput.value.trim();
  const durationMinutes = Number(durationInput.value);

  if (!title || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
    adminMessage.textContent = "Enter valid title and timer.";
    return;
  }
  if (draftQuestions.length === 0) {
    adminMessage.textContent = "Add at least one question.";
    return;
  }

  const payload = {
    title,
    durationMinutes,
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

async function loadTests() {
  testsList.innerHTML = "";
  try {
    const response = await fetch("/api/tests");
    const tests = await response.json();
    tests.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${escapeHtml(t.title)}</strong><br>
        Test ID: ${t.id} | Timer: ${t.durationMinutes} min<br>
        <a href="/test.html?id=${t.id}" target="_blank" rel="noopener">Open Student Link</a>
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
