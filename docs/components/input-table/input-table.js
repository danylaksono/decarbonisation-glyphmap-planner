export function highlightRows(form, { color = "yellow" }) {
  form.append(htl.html`<style>
      #${form.id} td.selected,
      #${form.id} td.selected ~ td { background: ${color} }
    `);
  const update = () => {
    for (const n of form.querySelectorAll(
      "input[type=checkbox],input[type=radio]"
    )) {
      const toggle =
        n.parentElement.classList.contains("selected") !== n.checked;
      if (toggle) n.parentElement.classList.toggle("selected");
    }
  };
  update();
  form.addEventListener("input", update);
  // Handle lazily loaded rows.
  const observer = new MutationObserver(update);
  observer.observe(form.querySelector("tbody"), { childList: true });

  return form;
}
