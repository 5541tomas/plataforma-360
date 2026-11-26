import { deleteTask, toggleTask } from "@/app/(app)/objetivos/actions";

export function TaskItem({ t, meta, tag }: { t: { id: string; title: string; done: boolean }; meta?: string; tag?: { label: string; cls: string } }) {
  return (
    <li className="flex items-center gap-3 border-b border-[#F0F0F2] py-2.5 last:border-0">
      <form action={toggleTask}>
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="done" value={String(t.done)} />
        <button aria-label={t.done ? `Desmarcar: ${t.title}` : `Concluir: ${t.title}`}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-white ${t.done ? "bg-accent" : "border-[1.5px] border-[#C7C7CC] bg-white hover:border-accent"}`}>
          {t.done ? "✓" : ""}
        </button>
      </form>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-sm ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      {tag && <span className={`chip ${tag.cls}`}>{tag.label}</span>}
      <form action={deleteTask}>
        <input type="hidden" name="id" value={t.id} />
        <button aria-label={`Apagar tarefa: ${t.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-soft hover:text-warn">×</button>
      </form>
    </li>
  );
}

/** Só o botão de concluir (para listas onde o título já aparece) */
export function TaskCheck({ t }: { t: { id: string; title: string; done: boolean } }) {
  return (
    <form action={toggleTask}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="done" value={String(t.done)} />
      <button aria-label={t.done ? `Desmarcar: ${t.title}` : `Concluir: ${t.title}`}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm text-white ${t.done ? "bg-accent" : "border-[1.5px] border-[#C7C7CC] bg-white hover:border-accent"}`}>
        {t.done ? "✓" : ""}
      </button>
    </form>
  );
}
