// THROWAWAY SPIKE shell (plain JS; the real shell is a Gable app).
const frame = document.getElementById("preview");
const $ = (id) => document.getElementById(id);
const project = await (await fetch("/api/project")).json();
frame.src = project.previewUrl;
const send = (m) => frame.contentWindow.postMessage({ __gable: 1, ...m }, "*");
$("pick").onchange = (e) => send({ type: "mode", pick: e.target.checked });

addEventListener("message", async (e) => {
  if (e.source !== frame.contentWindow || !e.data?.__gable) return;
  const m = e.data;
  window.__lastMessages = [...(window.__lastMessages ?? []), m.type];
  if (m.type === "tree") {
    window.__tree = m.tree;
    $("tree").replaceChildren(
      ...m.tree.map((n) => Object.assign(document.createElement("div"), {
        textContent: `${n.parent ? "  └ " : ""}${n.name}  <${n.host}>`,
        onmouseenter: () => send({ type: "highlight", id: n.id }),
        onmouseleave: () => send({ type: "highlight", id: null }),
      })),
    );
  }
  if (m.type === "pick") {
    const out = m.template ? await (await fetch("/api/resolve", { method: "POST", body: JSON.stringify(m.template) })).json() : { error: "no template node (root host?)" };
    window.__picked = { ...m, resolved: out };
    $("picked").innerHTML = out.error
      ? `&lt;${m.tag}&gt;: ${out.error}`
      : `<b>&lt;${m.tag}&gt;</b> in <b>${m.template.component?.name}</b><br>${out.file}<br>${out.range.from.line}:${out.range.from.col} → ${out.range.to.line}:${out.range.to.col}<pre></pre>`;
    if (!out.error) $("picked").querySelector("pre").textContent = out.text;
  }
});
