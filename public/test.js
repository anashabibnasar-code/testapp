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

function renderQuestions() {
  testForm.innerHTML = "";
  loadedTest.questions.forEach((q, index) => {
    const div = document.createElement("div");
    div.className = "question";
    div.innerHTML = `
      <strong>${index + 1}. ${escapeHtml(q.question)}</strong>
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
          <strong>Q${index + 1}. ${escapeHtml(item.question)}</strong>
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
