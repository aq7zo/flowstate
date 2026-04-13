import { deleteTemplate, getTemplates, saveTemplate, updateTemplate } from "../db.js";

export function createTemplatesModule({ tasksModule, dateLabel }) {
  const openBtn = document.querySelector("#apply-template-btn");
  const saveBtn = document.querySelector("#save-template-btn");
  const modal = document.querySelector("#template-modal");
  const closeBtn = document.querySelector("#template-close-btn");
  const templateNameNode = document.querySelector("#template-name");
  const templateSaveBtn = document.querySelector("#template-save-btn");
  const templateListNode = document.querySelector("#template-list");

  const previewModal = document.querySelector("#template-preview-modal");
  const previewCopyNode = document.querySelector("#template-preview-copy");
  const previewListNode = document.querySelector("#template-preview-list");
  const previewCloseBtn = document.querySelector("#template-preview-close-btn");
  const previewApplyAllBtn = document.querySelector("#template-apply-all-btn");
  const previewApplySelectedBtn = document.querySelector("#template-apply-selected-btn");

  let templates = [];
  let selectedTemplate = null;

  async function refreshTemplates() {
    templates = await getTemplates();
    templateListNode.innerHTML = "";
    templates.forEach((template) => {
      const li = document.createElement("li");
      li.className = "task-item";

      const name = document.createElement("p");
      name.className = "task-title";
      name.textContent = template.name;

      const details = document.createElement("p");
      details.className = "muted mono";
      details.textContent = `${template.tasks.length} tasks`;

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "icon-btn";
      previewBtn.setAttribute("aria-label", "Preview template");
      previewBtn.textContent = "👁";
      previewBtn.addEventListener("click", () => openPreview(template));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-btn";
      deleteBtn.setAttribute("aria-label", "Delete template");
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", async () => {
        await deleteTemplate(template.id);
        await refreshTemplates();
      });

      actions.append(previewBtn, deleteBtn);
      li.append(name, details, actions);
      templateListNode.append(li);
    });
  }

  async function saveCurrentAsTemplate() {
    const name = templateNameNode.value.trim();
    if (!name) return;
    const tasks = tasksModule
      .getCurrentTasks()
      .filter((task) => !task.parentId)
      .map((task) => ({
        title: task.title,
        priority: task.priority,
        estimatedMin: task.estimatedMin,
        type: task.type,
        notes: task.notes,
        link: task.link,
      }));
    await saveTemplate({
      name,
      tasks,
      createdAt: new Date(),
    });
    templateNameNode.value = "";
    await refreshTemplates();
  }

  function openPreview(template) {
    selectedTemplate = template;
    previewCopyNode.textContent = `This will add ${template.tasks.length} tasks to ${dateLabel}.`;
    previewListNode.innerHTML = "";
    template.tasks.forEach((task, index) => {
      const row = document.createElement("li");
      row.className = "task-item";
      row.dataset.index = String(index);
      const label = document.createElement("label");
      label.className = "task-title";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.className = "template-task-check";
      checkbox.dataset.index = String(index);
      const text = document.createElement("span");
      text.textContent = `${task.title} (${task.priority || "medium"})`;
      label.append(checkbox, text);
      row.append(label);
      previewListNode.append(row);
    });
    previewModal.showModal();
  }

  async function applyTemplate(onlySelected) {
    if (!selectedTemplate) return;
    const checkedIndexes = new Set(
      Array.from(previewListNode.querySelectorAll(".template-task-check"))
        .filter((input) => input.checked)
        .map((input) => Number(input.dataset.index)),
    );
    const tasks = selectedTemplate.tasks.filter((_, index) => (onlySelected ? checkedIndexes.has(index) : true));
    await tasksModule.appendTasksFromTemplate(tasks, selectedTemplate.id);
    await updateTemplate(selectedTemplate.id, { lastUsed: new Date() });
    previewModal.close();
    modal.close();
    await refreshTemplates();
  }

  openBtn.addEventListener("click", async () => {
    await refreshTemplates();
    modal.showModal();
  });

  saveBtn.addEventListener("click", async () => {
    modal.showModal();
    await refreshTemplates();
  });

  templateSaveBtn.addEventListener("click", saveCurrentAsTemplate);
  closeBtn.addEventListener("click", () => modal.close());
  previewCloseBtn.addEventListener("click", () => previewModal.close());
  previewApplyAllBtn.addEventListener("click", () => applyTemplate(false));
  previewApplySelectedBtn.addEventListener("click", () => applyTemplate(true));

  return {
    init: refreshTemplates,
  };
}
