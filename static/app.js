const state = {
    meta: null,
    boardQuestions: [],
    availableThemes: [],
    teacherQuestions: [],
    selectedSubject: "",
    selectedYear: "",
    selectedScope: "all",
    selectedTheme: "",
    openTiles: new Set(),
    revealedAnswers: new Set(),
    editingQuestionId: null,
    currentView: "setup",
    teacherPanelExpanded: false,
};

const elements = {};
const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_SLOT_CONFIG = {
    prompt: {
        pasteZone: "promptImagePasteZone",
        input: "promptImageUrlInput",
        previewCard: "promptImagePreviewCard",
        preview: "promptImagePreview",
        path: "promptImagePath",
        clearButton: "clearPromptImageButton",
        successLabel: "Vraagfoto opgeslagen.",
        emptyMessage: "Er zit geen afbeelding in je klembord voor de vraagfoto.",
    },
    answer: {
        pasteZone: "answerImagePasteZone",
        input: "answerImageUrlInput",
        previewCard: "answerImagePreviewCard",
        preview: "answerImagePreview",
        path: "answerImagePath",
        clearButton: "clearAnswerImageButton",
        successLabel: "Antwoordfoto opgeslagen.",
        emptyMessage: "Er zit geen afbeelding in je klembord voor de antwoordfoto.",
    },
};

document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    void boot();
});

function cacheElements() {
    elements.setupScreen = document.getElementById("setupScreen");
    elements.boardScreen = document.getElementById("boardScreen");
    elements.lessonSubjectSelect = document.getElementById("lessonSubjectSelect");
    elements.lessonYearSelect = document.getElementById("lessonYearSelect");
    elements.lessonScopeSelect = document.getElementById("lessonScopeSelect");
    elements.lessonThemeField = document.getElementById("lessonThemeField");
    elements.lessonThemeSelect = document.getElementById("lessonThemeSelect");
    elements.goToBoardButton = document.getElementById("goToBoardButton");

    elements.subjectStatusPill = document.getElementById("subjectStatusPill");
    elements.yearStatusPill = document.getElementById("yearStatusPill");
    elements.scopeStatusPill = document.getElementById("scopeStatusPill");
    elements.questionCountPill = document.getElementById("questionCountPill");

    elements.boardHint = document.getElementById("boardHint");
    elements.boardGrid = document.getElementById("boardGrid");
    elements.boardSubjectPill = document.getElementById("boardSubjectPill");
    elements.boardYearPill = document.getElementById("boardYearPill");
    elements.boardScopePill = document.getElementById("boardScopePill");
    elements.backToSetupButton = document.getElementById("backToSetupButton");
    elements.imagePopup = document.getElementById("imagePopup");
    elements.imagePopupImage = document.getElementById("imagePopupImage");
    elements.imagePopupTitle = document.getElementById("imagePopupTitle");
    elements.imagePopupClose = document.getElementById("imagePopupClose");

    elements.teacherLocked = document.getElementById("teacherLocked");
    elements.teacherUnlocked = document.getElementById("teacherUnlocked");
    elements.teacherPanelContent = document.getElementById("teacherPanelContent");
    elements.teacherToggleButton = document.getElementById("teacherToggleButton");
    elements.teacherLoginForm = document.getElementById("teacherLoginForm");
    elements.teacherPasswordInput = document.getElementById("teacherPasswordInput");
    elements.teacherLoginMessage = document.getElementById("teacherLoginMessage");
    elements.teacherLogoutButton = document.getElementById("teacherLogoutButton");
    elements.teacherCountPill = document.getElementById("teacherCountPill");

    elements.subjectForm = document.getElementById("subjectForm");
    elements.subjectNameInput = document.getElementById("subjectNameInput");
    elements.subjectFormMessage = document.getElementById("subjectFormMessage");
    elements.subjectList = document.getElementById("subjectList");

    elements.questionForm = document.getElementById("questionForm");
    elements.subjectInput = document.getElementById("subjectInput");
    elements.yearInput = document.getElementById("yearInput");
    elements.themeInput = document.getElementById("themeInput");
    elements.activeInput = document.getElementById("activeInput");
    elements.promptInput = document.getElementById("promptInput");
    elements.answerInput = document.getElementById("answerInput");
    elements.promptImagePasteZone = document.getElementById("promptImagePasteZone");
    elements.promptImageUrlInput = document.getElementById("promptImageUrlInput");
    elements.promptImagePreviewCard = document.getElementById("promptImagePreviewCard");
    elements.promptImagePreview = document.getElementById("promptImagePreview");
    elements.promptImagePath = document.getElementById("promptImagePath");
    elements.clearPromptImageButton = document.getElementById("clearPromptImageButton");
    elements.answerImagePasteZone = document.getElementById("answerImagePasteZone");
    elements.answerImageUrlInput = document.getElementById("answerImageUrlInput");
    elements.answerImagePreviewCard = document.getElementById("answerImagePreviewCard");
    elements.answerImagePreview = document.getElementById("answerImagePreview");
    elements.answerImagePath = document.getElementById("answerImagePath");
    elements.clearAnswerImageButton = document.getElementById("clearAnswerImageButton");
    elements.saveQuestionButton = document.getElementById("saveQuestionButton");
    elements.cancelEditButton = document.getElementById("cancelEditButton");
    elements.teacherFormMessage = document.getElementById("teacherFormMessage");
    elements.teacherQuestionList = document.getElementById("teacherQuestionList");
}

function bindEvents() {
    bindImagePasteHandling("prompt");
    bindImagePasteHandling("answer");

    elements.lessonSubjectSelect.addEventListener("change", async () => {
        state.selectedSubject = elements.lessonSubjectSelect.value;
        state.selectedTheme = "";
        clearBoardState();
        await loadBoardQuestions();
        renderAll();
    });

    elements.lessonYearSelect.addEventListener("change", async () => {
        state.selectedYear = elements.lessonYearSelect.value;
        state.selectedTheme = "";
        clearBoardState();
        await loadBoardQuestions();
        renderAll();
    });

    elements.lessonScopeSelect.addEventListener("change", async () => {
        state.selectedScope = elements.lessonScopeSelect.value;
        state.selectedTheme = "";
        clearBoardState();
        await loadBoardQuestions();
        renderAll();
    });

    elements.lessonThemeSelect.addEventListener("change", async () => {
        state.selectedTheme = elements.lessonThemeSelect.value;
        clearBoardState();
        await loadBoardQuestions();
        renderAll();
    });

    elements.teacherToggleButton.addEventListener("click", () => {
        state.teacherPanelExpanded = !state.teacherPanelExpanded;
        renderTeacherPanel();
    });

    elements.goToBoardButton.addEventListener("click", () => {
        if (!canEnterBoardScreen()) {
            return;
        }
        state.currentView = "board";
        renderAll();
    });

    elements.backToSetupButton.addEventListener("click", () => {
        state.currentView = "setup";
        renderAll();
    });

    elements.boardGrid.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        const action = button.dataset.action;
        const questionId = button.dataset.id;

        if (action === "image-preview") {
            openImagePopup(button.dataset.src || "", button.dataset.title || "Afbeelding");
            return;
        }

        if (!questionId) {
            return;
        }

        if (action === "open") {
            state.openTiles.add(questionId);
        }

        if (action === "close") {
            state.openTiles.delete(questionId);
            state.revealedAnswers.delete(questionId);
        }

        if (action === "toggle-answer") {
            if (state.revealedAnswers.has(questionId)) {
                state.revealedAnswers.delete(questionId);
            } else {
                state.revealedAnswers.add(questionId);
            }
        }

        renderBoard();
    });

    elements.imagePopup.addEventListener("click", (event) => {
        if (event.target === elements.imagePopup) {
            closeImagePopup();
        }
    });

    elements.imagePopupClose.addEventListener("click", closeImagePopup);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !elements.imagePopup.hidden) {
            closeImagePopup();
        }
    });

    elements.teacherLoginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setFeedback(elements.teacherLoginMessage, "");
        try {
            await fetchJson("/api/teacher/login", {
                method: "POST",
                body: JSON.stringify({ password: elements.teacherPasswordInput.value }),
            });
            elements.teacherPasswordInput.value = "";
            await Promise.all([loadMeta(), loadTeacherQuestions()]);
            renderAll();
        } catch (error) {
            setFeedback(elements.teacherLoginMessage, error.message, true);
        }
    });

    elements.teacherLogoutButton.addEventListener("click", async () => {
        await fetchJson("/api/teacher/logout", { method: "POST" });
        state.teacherQuestions = [];
        state.editingQuestionId = null;
        await loadMeta();
        resetTeacherForm();
        renderAll();
    });

    elements.subjectForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setFeedback(elements.subjectFormMessage, "");
        try {
            await fetchJson("/api/teacher/subjects", {
                method: "POST",
                body: JSON.stringify({ name: elements.subjectNameInput.value.trim() }),
            });
            elements.subjectNameInput.value = "";
            await loadMeta();
            await loadBoardQuestions();
            renderAll();
            setFeedback(elements.subjectFormMessage, "Vak toegevoegd.", false, true);
        } catch (error) {
            setFeedback(elements.subjectFormMessage, error.message, true);
        }
    });

    elements.questionForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setFeedback(elements.teacherFormMessage, "");

        const payload = {
            subjectId: elements.subjectInput.value,
            yearLevel: elements.yearInput.value,
            theme: elements.themeInput.value.trim(),
            prompt: elements.promptInput.value.trim(),
            answer: elements.answerInput.value.trim(),
            promptImageUrl: elements.promptImageUrlInput.value.trim(),
            answerImageUrl: elements.answerImageUrlInput.value.trim(),
            active: elements.activeInput.checked,
        };

        if (!payload.prompt && !payload.promptImageUrl) {
            setFeedback(elements.teacherFormMessage, "Voeg een vraagtekst of een vraagfoto toe.", true);
            return;
        }
        if (!payload.answer && !payload.answerImageUrl) {
            setFeedback(elements.teacherFormMessage, "Voeg een antwoordtekst of een antwoordfoto toe.", true);
            return;
        }

        const editing = Boolean(state.editingQuestionId);
        const url = editing
            ? `/api/teacher/questions/${state.editingQuestionId}`
            : "/api/teacher/questions";
        const method = editing ? "PUT" : "POST";

        try {
            await fetchJson(url, {
                method,
                body: JSON.stringify(payload),
            });
            resetTeacherForm();
            await Promise.all([loadTeacherQuestions(), loadBoardQuestions()]);
            renderAll();
            setFeedback(
                elements.teacherFormMessage,
                editing ? "Vraag bijgewerkt." : "Vraag toegevoegd.",
                false,
                true,
            );
        } catch (error) {
            setFeedback(elements.teacherFormMessage, error.message, true);
        }
    });

    elements.questionForm.addEventListener("click", (event) => {
        const button = event.target.closest("[data-math-target][data-insert]");
        if (!button) {
            return;
        }

        const target = button.dataset.mathTarget === "answer"
            ? elements.answerInput
            : elements.promptInput;
        insertAtCursor(target, button.dataset.insert || "", Number(button.dataset.caretOffset || 0));
    });

    elements.cancelEditButton.addEventListener("click", () => {
        resetTeacherForm();
        renderTeacherState();
    });

    elements.teacherQuestionList.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-role]");
        if (!button) {
            return;
        }

        const questionId = button.dataset.id;
        if (!questionId) {
            return;
        }

        if (button.dataset.role === "edit") {
            const question = state.teacherQuestions.find((item) => item.id === questionId);
            if (!question) {
                return;
            }
            state.editingQuestionId = question.id;
            elements.subjectInput.value = question.subjectId;
            elements.yearInput.value = question.yearLevel;
            elements.themeInput.value = question.theme || "";
            elements.activeInput.checked = Boolean(question.active);
            elements.promptInput.value = question.prompt;
            elements.answerInput.value = question.answer;
            elements.promptImageUrlInput.value = question.promptImageUrl || "";
            elements.answerImageUrlInput.value = question.answerImageUrl || "";
            renderStoredImagePreview("prompt");
            renderStoredImagePreview("answer");
            elements.saveQuestionButton.textContent = "Vraag bijwerken";
            elements.cancelEditButton.hidden = false;
            setFeedback(elements.teacherFormMessage, "Bewerk de vraag en bewaar opnieuw.");
            elements.promptInput.focus();
            return;
        }

        if (button.dataset.role === "delete") {
            const confirmed = window.confirm("Deze vraag verwijderen?");
            if (!confirmed) {
                return;
            }
            try {
                await fetchJson(`/api/teacher/questions/${questionId}`, { method: "DELETE" });
                if (state.editingQuestionId === questionId) {
                    resetTeacherForm();
                }
                await Promise.all([loadTeacherQuestions(), loadBoardQuestions()]);
                renderAll();
                setFeedback(elements.teacherFormMessage, "Vraag verwijderd.", false, true);
            } catch (error) {
                setFeedback(elements.teacherFormMessage, error.message, true);
            }
        }
    });
}

function imageSlot(slotName) {
    const config = IMAGE_SLOT_CONFIG[slotName];
    return config
        ? {
            ...config,
            pasteZone: elements[config.pasteZone],
            input: elements[config.input],
            previewCard: elements[config.previewCard],
            preview: elements[config.preview],
            path: elements[config.path],
            clearButton: elements[config.clearButton],
        }
        : null;
}

function bindImagePasteHandling(slotName) {
    const slot = imageSlot(slotName);
    if (!slot || !slot.pasteZone || !slot.clearButton) {
        return;
    }

    if (slot.pasteZone.dataset.bound !== "true") {
        slot.pasteZone.dataset.bound = "true";
        slot.pasteZone.dataset.idleLabel = slot.pasteZone.textContent.trim();
        slot.pasteZone.addEventListener("click", () => {
            slot.pasteZone.focus();
        });
        slot.pasteZone.addEventListener("paste", async (event) => {
            const file = pastedImageFile(event);
            if (!file) {
                setFeedback(elements.teacherFormMessage, slot.emptyMessage, true);
                return;
            }

            event.preventDefault();
            await uploadPastedImage(file, slotName);
        });
    }

    if (slot.clearButton.dataset.bound !== "true") {
        slot.clearButton.dataset.bound = "true";
        slot.clearButton.addEventListener("click", () => {
            slot.input.value = "";
            renderStoredImagePreview(slotName);
            setFeedback(elements.teacherFormMessage, "Foto verwijderd uit deze vraag.", false, true);
        });
    }

    renderStoredImagePreview(slotName);
}

function pastedImageFile(event) {
    const items = Array.from(event.clipboardData?.items || []);
    for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
            return item.getAsFile();
        }
    }
    return null;
}

async function uploadPastedImage(file, slotName) {
    const slot = imageSlot(slotName);
    if (!slot) {
        return;
    }
    if (!file.type.startsWith("image/")) {
        setFeedback(elements.teacherFormMessage, "Plak een png, jpg, webp of gif.", true);
        return;
    }
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
        setFeedback(elements.teacherFormMessage, "De afbeelding is te groot. Gebruik een foto tot 8 MB.", true);
        return;
    }

    setImageSlotUploading(slotName, true);
    setFeedback(elements.teacherFormMessage, "");
    try {
        const dataUrl = await fileToDataUrl(file);
        const payload = await fetchJson("/api/teacher/images", {
            method: "POST",
            body: JSON.stringify({ dataUrl }),
        });
        slot.input.value = String(payload.imageUrl || "");
        renderStoredImagePreview(slotName);
        setFeedback(elements.teacherFormMessage, slot.successLabel, false, true);
    } catch (error) {
        setFeedback(elements.teacherFormMessage, error.message, true);
    } finally {
        setImageSlotUploading(slotName, false);
    }
}

function setImageSlotUploading(slotName, uploading) {
    const slot = imageSlot(slotName);
    if (!slot) {
        return;
    }

    slot.pasteZone.disabled = uploading;
    slot.pasteZone.classList.toggle("is-uploading", uploading);
    slot.pasteZone.textContent = uploading
        ? "Afbeelding wordt opgeslagen..."
        : (slot.pasteZone.dataset.idleLabel || "Klik hier en plak een foto met Ctrl+V");
    slot.clearButton.disabled = uploading || !slot.input.value.trim();
}

function renderStoredImagePreview(slotName) {
    const slot = imageSlot(slotName);
    if (!slot) {
        return;
    }

    const imageUrl = slot.input.value.trim();
    if (!imageUrl) {
        slot.previewCard.hidden = true;
        slot.preview.removeAttribute("src");
        slot.path.textContent = "";
        slot.clearButton.disabled = true;
        return;
    }

    slot.previewCard.hidden = false;
    slot.preview.src = imageUrl;
    slot.path.textContent = imageUrl;
    slot.clearButton.disabled = false;
}

async function boot() {
    await loadMeta();
    await loadBoardQuestions();
    if (state.meta.teacherLoggedIn) {
        await loadTeacherQuestions();
    }
    renderAll();
}

async function loadMeta() {
    const currentSubject = state.selectedSubject;
    state.meta = await fetchJson("/api/meta");
    populateLessonSelects();
    populateTeacherSelects();

    const validIds = new Set(subjectList().map((subject) => subject.id));
    if (!validIds.has(currentSubject)) {
        state.selectedSubject = validIds.has(state.selectedSubject) ? state.selectedSubject : "";
    }
    if (!validIds.has(state.selectedSubject)) {
        state.selectedSubject = "";
    }
}

async function loadBoardQuestions() {
    if (!state.selectedSubject || !state.selectedYear) {
        state.boardQuestions = [];
        state.availableThemes = [];
        return;
    }

    const params = new URLSearchParams({
        subject_id: state.selectedSubject,
        year_level: state.selectedYear,
        scope: state.selectedScope,
    });
    if (state.selectedScope === "theme" && state.selectedTheme) {
        params.set("theme", state.selectedTheme);
    }

    const payload = await fetchJson(`/api/questions?${params.toString()}`);
    state.availableThemes = payload.availableThemes || [];
    if (
        state.selectedScope === "theme"
        && state.selectedTheme
        && !state.availableThemes.includes(state.selectedTheme)
    ) {
        state.selectedTheme = "";
    }
    state.boardQuestions = payload.questions || [];
}

async function loadTeacherQuestions() {
    const payload = await fetchJson("/api/teacher/questions");
    state.teacherQuestions = payload.questions || [];
}

function populateLessonSelects() {
    const subjects = subjectList();
    const years = yearList();

    elements.lessonSubjectSelect.innerHTML = [
        '<option value="">Kies een vak</option>',
        ...subjects.map(
            (subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`,
        ),
    ].join("");

    elements.lessonYearSelect.innerHTML = [
        '<option value="">Kies een jaar</option>',
        ...years.map(
            (year) => `<option value="${year.id}">${escapeHtml(year.label)}</option>`,
        ),
    ].join("");

    elements.lessonScopeSelect.value = state.selectedScope;
    elements.lessonSubjectSelect.value = state.selectedSubject;
    elements.lessonYearSelect.value = state.selectedYear;
}

function populateTeacherSelects() {
    const subjects = subjectList();
    const years = yearList();

    elements.subjectInput.innerHTML = subjects
        .map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`)
        .join("");
    elements.yearInput.innerHTML = years
        .map((year) => `<option value="${year.id}">${escapeHtml(year.label)}</option>`)
        .join("");

    if (!state.editingQuestionId) {
        resetTeacherForm();
    }
}

function renderAll() {
    if (!canEnterBoardScreen() && state.currentView === "board") {
        state.currentView = "setup";
    }
    renderThemeField();
    renderSummary();
    renderView();
    renderBoard();
    renderTeacherPanel();
    renderTeacherState();
}

function renderThemeField() {
    const visible = Boolean(
        state.selectedSubject
        && state.selectedYear
        && state.selectedScope === "theme",
    );
    elements.lessonThemeField.hidden = !visible;

    if (!visible) {
        elements.lessonThemeSelect.innerHTML = '<option value="">Kies een thema</option>';
        return;
    }

    const options = ['<option value="">Kies een thema</option>'];
    if (!state.availableThemes.length) {
        options.push('<option value="" disabled>Nog geen thema\'s beschikbaar</option>');
    } else {
        for (const theme of state.availableThemes) {
            const selected = theme === state.selectedTheme ? " selected" : "";
            options.push(`<option value="${escapeHtml(theme)}"${selected}>${escapeHtml(theme)}</option>`);
        }
    }
    elements.lessonThemeSelect.innerHTML = options.join("");
    elements.lessonThemeSelect.disabled = !state.availableThemes.length;
    elements.lessonThemeSelect.value = state.selectedTheme;
}

function renderSummary() {
    const subject = subjectById(state.selectedSubject);
    const year = yearById(state.selectedYear);
    const scope = scopeLabel();
    const canContinue = canEnterBoardScreen();

    elements.subjectStatusPill.textContent = subject ? subject.name : "Nog geen vak";
    elements.yearStatusPill.textContent = year ? year.label : "Nog geen jaar";
    elements.scopeStatusPill.textContent = scope;
    elements.questionCountPill.textContent = `${state.boardQuestions.length} vragen klaar`;
    elements.boardSubjectPill.textContent = subject ? subject.name : "Vak";
    elements.boardYearPill.textContent = year ? year.label : "Jaar";
    elements.boardScopePill.textContent = scope;
    elements.goToBoardButton.disabled = !canContinue;
}

function renderTeacherPanel() {
    elements.teacherPanelContent.hidden = !state.teacherPanelExpanded;
    elements.teacherToggleButton.textContent = state.teacherPanelExpanded
        ? "Sluit leerkrachtenunit"
        : "Open leerkrachtenunit";
}

function renderView() {
    const onBoard = state.currentView === "board";
    elements.setupScreen.hidden = onBoard;
    elements.boardScreen.hidden = !onBoard;
    document.body.classList.toggle("board-mode", onBoard);
    if (onBoard) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
}

function renderBoard() {
    elements.boardHint.textContent = boardHint();
    applyBoardDensity();

    if (!state.selectedSubject || !state.selectedYear) {
        elements.boardGrid.innerHTML = emptyStateMarkup(
            "Kies eerst een vak en een jaar om het lesbord te vullen.",
        );
        return;
    }

    if (state.selectedScope === "theme" && !state.selectedTheme) {
        elements.boardGrid.innerHTML = emptyStateMarkup(
            state.availableThemes.length
                ? "Kies nog een thema om het bord klaar te zetten."
                : "Voor dit vak en jaar zijn nog geen thema's toegevoegd.",
        );
        return;
    }

    if (!state.boardQuestions.length) {
        elements.boardGrid.innerHTML = emptyStateMarkup(
            "Voor deze leskeuze zijn nog geen vragen toegevoegd.",
        );
        return;
    }

    elements.boardGrid.innerHTML = state.boardQuestions
        .map((question) => renderTile(question))
        .join("");
}

function renderRichTextMarkup(text, className) {
    const content = String(text || "").trim();
    if (!content) {
        return "";
    }
    return `<p class="${className}">${escapeHtml(content)}</p>`;
}

function renderImageMarkup(imageUrl, altText, className) {
    const src = String(imageUrl || "").trim();
    if (!src) {
        return "";
    }
    return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(altText)}">`;
}

function renderTileImageButtonMarkup(imageUrl, title) {
    const src = String(imageUrl || "").trim();
    if (!src) {
        return "";
    }
    return `
        <button class="tile-media-button" type="button" data-action="image-preview" data-src="${escapeHtml(src)}" data-title="${escapeHtml(title)}">
            <img class="tile-media" src="${escapeHtml(src)}" alt="${escapeHtml(title)}">
        </button>
    `;
}

function renderTile(question) {
    const color = colorById(question.tokenColor);
    const shape = shapeById(question.tokenShape);
    const open = state.openTiles.has(question.id);
    const revealAnswer = state.revealedAnswers.has(question.id);
    const questionContentMarkup = [
        renderRichTextMarkup(question.prompt, "tile-question"),
        renderTileImageButtonMarkup(question.promptImageUrl, "Vraagfoto"),
    ].join("");
    const answerContentMarkup = [
        renderRichTextMarkup(question.answer, "tile-answer"),
        renderTileImageButtonMarkup(question.answerImageUrl, "Antwoordfoto"),
    ].join("");
    const answerMarkup = revealAnswer && answerContentMarkup
        ? `<div class="tile-answer-block">${answerContentMarkup}</div>`
        : "";

    return `
        <article class="tile-card ${open ? "is-open" : ""}" style="--tile-frame:${color.hex}">
            <div class="tile-inner">
                <button class="tile-face tile-front" type="button" data-action="open" data-id="${question.id}">
                    <div class="shape-wrap">
                        <span class="shape-preview shape-${shape.id}" style="--shape-color:${color.hex}"></span>
                    </div>
                </button>
                <div class="tile-face tile-back">
                    <p class="eyebrow">Vraag</p>
                    <p class="tile-theme">${escapeHtml(question.theme || "Vraag uit de leerstof")}</p>
                    ${questionContentMarkup}
                    ${answerMarkup}
                    <div class="tile-back-actions">
                        <button class="mini-button" type="button" data-action="toggle-answer" data-id="${question.id}">
                            ${revealAnswer ? "Verberg antwoord" : "Toon antwoord"}
                        </button>
                        <button class="mini-button" type="button" data-action="close" data-id="${question.id}">
                            Sluit vlak
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderTeacherState() {
    const loggedIn = Boolean(state.meta.teacherLoggedIn);
    elements.teacherLocked.hidden = loggedIn;
    elements.teacherUnlocked.hidden = !loggedIn;

    if (!loggedIn) {
        state.editingQuestionId = null;
        resetTeacherForm();
        return;
    }

    elements.teacherCountPill.textContent = `${state.teacherQuestions.length} vragen`;
    renderSubjectList();
    renderTeacherQuestionList();
}

function openImagePopup(src, title) {
    const imageSrc = String(src || "").trim();
    if (!imageSrc) {
        return;
    }
    elements.imagePopupTitle.textContent = title || "Afbeelding";
    elements.imagePopupImage.src = imageSrc;
    elements.imagePopupImage.alt = title || "Afbeelding";
    elements.imagePopup.hidden = false;
}

function closeImagePopup() {
    elements.imagePopup.hidden = true;
    elements.imagePopupImage.removeAttribute("src");
    elements.imagePopupImage.alt = "";
}

function renderSubjectList() {
    elements.subjectList.innerHTML = subjectList()
        .map((subject) => `<span class="pill subtle-pill">${escapeHtml(subject.name)}</span>`)
        .join("");
}

function renderTeacherQuestionList() {
    if (!state.teacherQuestions.length) {
        elements.teacherQuestionList.innerHTML = emptyStateMarkup(
            "De vraagbank is nog leeg. Voeg hierboven je eerste vraag toe.",
        );
        return;
    }

    elements.teacherQuestionList.innerHTML = state.teacherQuestions
        .map((question) => {
            const promptMarkup = [
                renderRichTextMarkup(question.prompt, "question-row-copy"),
                renderImageMarkup(question.promptImageUrl, "Afbeelding bij de vraag", "question-row-image"),
            ].join("");
            const answerMarkup = [
                renderRichTextMarkup(question.answer, "question-row-copy"),
                renderImageMarkup(question.answerImageUrl, "Afbeelding bij het antwoord", "question-row-image"),
            ].join("");
            return `
                <article class="question-row">
                    <div class="question-row-header">
                        <h4 class="question-row-title">${escapeHtml(question.subjectName)} - ${escapeHtml(question.yearLevel)} jaar</h4>
                        <span class="status-tag ${question.active ? "status-active" : "status-inactive"}">
                            ${question.active ? "Actief" : "Verborgen"}
                        </span>
                    </div>
                    <div class="question-row-meta">
                        <span class="pill subtle-pill">${escapeHtml(question.theme || "Zonder thema")}</span>
                    </div>
                    <div class="question-row-block">
                        <p class="question-row-label">Vraag</p>
                        ${promptMarkup}
                    </div>
                    <div class="question-row-block">
                        <p class="question-row-label">Antwoord</p>
                        ${answerMarkup}
                    </div>
                    <div class="question-row-actions">
                        <button class="mini-button" type="button" data-role="edit" data-id="${question.id}">Bewerken</button>
                        <button class="mini-button" type="button" data-role="delete" data-id="${question.id}">Verwijderen</button>
                    </div>
                </article>
            `;
        })
        .join("");
}

function resetTeacherForm() {
    state.editingQuestionId = null;
    elements.questionForm.reset();
    elements.activeInput.checked = true;
    elements.promptImageUrlInput.value = "";
    elements.answerImageUrlInput.value = "";
    renderStoredImagePreview("prompt");
    renderStoredImagePreview("answer");
    const subjects = subjectList();
    const years = yearList();
    if (state.meta) {
        if (subjects[0]) {
            elements.subjectInput.value = subjects[0].id;
        }
        if (years[0]) {
            elements.yearInput.value = years[0].id;
        }
    }
    elements.saveQuestionButton.textContent = "Vraag bewaren";
    elements.cancelEditButton.hidden = true;
}

function clearBoardState() {
    state.openTiles.clear();
    state.revealedAnswers.clear();
}

function boardHint() {
    if (!state.selectedSubject || !state.selectedYear) {
        return "Kies eerst een vak en een jaar.";
    }
    if (state.selectedScope === "theme" && !state.selectedTheme) {
        return "Kies nog een thema.";
    }
    if (!state.boardQuestions.length) {
        return "Er staan nog geen vragen klaar voor deze leskeuze.";
    }
    return "Laat de leerlingen een vormvlak kiezen en draai daarna de vraag open.";
}

function applyBoardDensity() {
    const count = state.boardQuestions.length;
    const hasImages = state.boardQuestions.some((question) => question.promptImageUrl || question.answerImageUrl);
    let minWidth = 220;
    let minHeight = 260;
    let shapeSize = 116;

    if (count >= 7 && count <= 12) {
        minWidth = 180;
        minHeight = 220;
        shapeSize = 92;
    } else if (count >= 13 && count <= 20) {
        minWidth = 150;
        minHeight = 190;
        shapeSize = 76;
    } else if (count > 20) {
        minWidth = 128;
        minHeight = 160;
        shapeSize = 62;
    }

    if (hasImages) {
        minWidth = Math.max(minWidth, 210);
        minHeight = Math.max(minHeight, 340);
    }

    elements.boardGrid.style.setProperty("--board-tile-min", `${minWidth}px`);
    elements.boardGrid.style.setProperty("--board-tile-height", `${minHeight}px`);
    elements.boardGrid.style.setProperty("--board-shape-size", `${shapeSize}px`);
}

function scopeLabel() {
    if (!state.selectedSubject || !state.selectedYear) {
        return "Nog geen leerstofkeuze";
    }
    if (state.selectedScope === "all") {
        return "Ganse leerstof";
    }
    if (!state.selectedTheme) {
        return "Kies nog een thema";
    }
    return `Thema: ${state.selectedTheme}`;
}

function emptyStateMarkup(message) {
    return `
        <div class="empty-state">
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function subjectById(id) {
    return subjectList().find((subject) => subject.id === id) || null;
}

function yearById(id) {
    return yearList().find((year) => year.id === id) || null;
}

function colorById(id) {
    return state.meta.colors.find((color) => color.id === id) || state.meta.colors[0];
}

function shapeById(id) {
    return state.meta.shapes.find((shape) => shape.id === id) || state.meta.shapes[0];
}

function subjectList() {
    return Array.isArray(state.meta?.subjects) ? state.meta.subjects : [];
}

function yearList() {
    return Array.isArray(state.meta?.years) ? state.meta.years : [];
}

function canEnterBoardScreen() {
    if (!state.selectedSubject || !state.selectedYear) {
        return false;
    }
    if (state.selectedScope === "theme" && !state.selectedTheme) {
        return false;
    }
    return state.boardQuestions.length > 0;
}

function setFeedback(element, message, isError = false, isSuccess = false) {
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(message && isError));
    element.classList.toggle("is-success", Boolean(message && isSuccess));
}

function insertAtCursor(input, text, caretOffset = 0) {
    if (!input || !text) {
        return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = `${before}${text}${after}`;

    const offset = Number.isFinite(caretOffset) && caretOffset > 0 ? caretOffset : text.length;
    const cursor = start + Math.min(offset, text.length);
    input.focus();
    input.setSelectionRange(cursor, cursor);
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.detail || "Er ging iets mis.");
    }

    return payload;
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => {
            reject(new Error("De afbeelding kon niet gelezen worden."));
        };
        reader.onload = () => {
            resolve(String(reader.result || ""));
        };
        reader.readAsDataURL(file);
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
