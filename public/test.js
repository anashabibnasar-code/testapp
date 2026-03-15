const params = new URLSearchParams(window.location.search);
const testId = Number(params.get("id"));

const testTitle = document.getElementById("testTitle");
const timerBox = document.getElementById("timerBox");
const startBlock = document.getElementById("startBlock");
const studentNameInput = document.getElementById("studentName");
const startBtn = document.getElementById("startBtn");
const testForm = document.getElementById("testForm");
const submitBtn = document.getElementById("submitBtn");
const resultBox = document.getElementById("resultBox");
const testMessage = document.getElementById("testMessage");

let loadedTest = null;
let submissionId = null;
let timerInterval = null;
let endTime = null;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestionContent(rawQuestion) {
  const question = String(rawQuestion || "");
  const codeRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const chunks = [];
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(question)) !== null) {
    const before = question.slice(lastIndex, match.index).trim();
    if (before) {
      chunks.push(`<p class="q-text">${escapeHtml(before).replaceAll("\n", "<br>")}</p>`);
    }

    const lang = match[1] ? `<div class="code-lang">${escapeHtml(match[1])}</div>` : "";
    const code = match[2].replace(/^\n/, "").trimEnd();
    chunks.push(`${lang}<pre class="code-block"><code>${escapeHtml(code)}</code></pre>`);
    lastIndex = codeRegex.lastIndex;
  }

  const after = question.slice(lastIndex).trim();
  if (after) {
    chunks.push(`<p class="q-text">${escapeHtml(after).replaceAll("\n", "<br>")}</p>`);
  }

  if (chunks.length === 0) {
    return `<p class="q-text">${escapeHtml(question).replaceAll("\n", "<br>")}</p>`;
  }

  return chunks.join("");
}

function renderQuestions() {
  testForm.innerHTML = "";
  loadedTest.questions.forEach((q, index) => {
    const div = document.createElement("div");
    div.className = "question";
    const contentHtml = renderQuestionContent(q.question);
    div.innerHTML = `
      <div class="question-stem">
        <div class="question-index">${index + 1}.</div>
        <div class="question-body">${contentHtml}</div>
      </div>
      ${q.options
        .map(
          (opt, i) => `
        <label class="option">
          <input type="radio" name="q_${q.id}" value="${i}"> ${escapeHtml(opt)}
        </label>
      `
        )
        .join("")}
    `;
    testForm.appendChild(div);
  });
}

function startTimer(durationMinutes) {
  endTime = Date.now() + durationMinutes * 60 * 1000;
  timerBox.classList.remove("hidden");

  timerInterval = setInterval(() => {
    const left = endTime - Date.now();
    if (left <= 0) {
      timerBox.textContent = "Time Left: 00:00";
      clearInterval(timerInterval);
      submitTest(true);
      return;
    }
    const min = Math.floor(left / 60000).toString().padStart(2, "0");
    const sec = Math.floor((left % 60000) / 1000).toString().padStart(2, "0");
    timerBox.textContent = `Time Left: ${min}:${sec}`;
  }, 500);
}

async function loadTest() {
  if (!Number.isInteger(testId)) {
    testMessage.textContent = "Missing or invalid test id. Use /test.html?id=1";
    return;
  }

  try {
    const response = await fetch(`/api/tests/${testId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load test.");

    loadedTest = data;
    testTitle.textContent = data.title;
    testMessage.textContent = `Pass mark: ${data.passMark}/${data.questions.length}`;
  } catch (error) {
    testMessage.textContent = error.message;
  }
}

startBtn.addEventListener("click", async () => {
  const studentName = studentNameInput.value.trim();
  if (!studentName) {
    testMessage.textContent = "Enter your name first.";
    return;
  }
  if (!loadedTest) {
    testMessage.textContent = "Test is not loaded.";
    return;
  }

  try {
    const response = await fetch(`/api/tests/${testId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentName }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot start test.");

    submissionId = data.submissionId;
    renderQuestions();
    startBlock.classList.add("hidden");
    testForm.classList.remove("hidden");
    submitBtn.classList.remove("hidden");
    testMessage.textContent = "Test started. Submit before timer ends.";
    startTimer(data.durationMinutes);
  } catch (error) {
    testMessage.textContent = error.message;
  }
});

submitBtn.addEventListener("click", () => submitTest(false));

async function submitTest(autoSubmit) {
  if (!submissionId || !loadedTest) return;

  submitBtn.disabled = true;
  if (timerInterval) clearInterval(timerInterval);

  const answers = loadedTest.questions.map((q) => {
    const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return {
      questionId: q.id,
      selectedIndex: selected ? Number(selected.value) : -1,
    };
  });

  const cleanedAnswers = answers.filter((a) => a.selectedIndex >= 0 && a.selectedIndex <= 3);

  try {
    const response = await fetch(`/api/tests/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, answers: cleanedAnswers }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Submission failed.");

    showResult(data, autoSubmit);
  } catch (error) {
    testMessage.textContent = error.message;
    submitBtn.disabled = false;
  }
}

function showResult(data, autoSubmit) {
  const resultClass = data.result === "PASS" ? "correct" : "wrong";
  const scoreHtml = `
    <div class="score">
      Score: ${data.score}/${data.total} (${data.percent}%)<br>
      Pass Mark: ${data.passMark}/${data.total}<br>
      Result: <span class="${resultClass}">${data.result}</span>
    </div>
  `;
  const reviewHtml = data.review
    .map((item, index) => {
      const selectedText =
        item.selectedIndex === null || item.selectedIndex === undefined
          ? "Not answered"
          : `${"ABCD"[item.selectedIndex]}) ${escapeHtml(item.options[item.selectedIndex] || "-")}`;
      const correctText = `${"ABCD"[item.correctIndex]}) ${escapeHtml(item.options[item.correctIndex])}`;
      return `
        <div class="review-item">
          <div class="question-stem">
            <div class="question-index">Q${index + 1}.</div>
            <div class="question-body">${renderQuestionContent(item.question)}</div>
          </div>
          <div class="${item.isCorrect ? "correct" : "wrong"}">Your answer: ${selectedText}</div>
          <div class="correct">Correct answer: ${correctText}</div>
        </div>
      `;
    })
    .join("");

  resultBox.innerHTML = `${scoreHtml}${reviewHtml}`;
  resultBox.classList.remove("hidden");
  testForm.classList.add("hidden");
  submitBtn.classList.add("hidden");
  testMessage.textContent = autoSubmit
    ? "Time is over. Test auto-submitted. Result is now visible."
    : "Submitted successfully. Result and answers are now visible.";
}

loadTest();
