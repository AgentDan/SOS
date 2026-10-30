/* Меню слева и верхняя панель. Содержимое экрана приходит снаружи. */
function Shell({ nav = [], activeId, onGo, onLogout, title, topRight, children }) {
  const main = nav.filter((item) => item.group !== "legacy");
  const legacy = nav.filter((item) => item.group === "legacy");

  function skipToContent(event) {
    event.preventDefault();
    const target = document.getElementById("content");
    if (target) target.focus();
  }

  return (
    <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] narrow:grid-cols-1">
      <a
        href="#content"
        className="fixed top-3 left-3 z-50 m-[-1px] h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        onClick={skipToContent}
      >
        Перейти к содержимому
      </a>
      <aside className="sticky top-0 z-30 flex min-h-screen flex-col gap-1 self-start border-r border-line bg-side px-3 py-4 narrow:min-h-0 narrow:flex-row narrow:flex-wrap narrow:items-center narrow:border-r-0 narrow:border-b">
        <div className="mb-3 flex items-center gap-2 px-1 narrow:mb-0 narrow:mr-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
          <span className="leading-tight">
            <span className="block text-base font-semibold">SOS</span>
            <span className="block text-xs text-muted narrow:hidden">админка</span>
          </span>
        </div>
        <nav className="flex flex-col gap-1 narrow:flex-row narrow:flex-wrap" aria-label="Разделы админки">
          {main.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onGo={onGo} />
          ))}
          {legacy.length > 0 ? (
            <p className="mt-4 mb-1 px-3 text-xs font-medium text-muted narrow:mt-0 narrow:mb-0 narrow:w-full">
              Пока по-старому
            </p>
          ) : null}
          {legacy.map((item) => (
            <NavButton key={item.id} item={item} active={item.id === activeId} onGo={onGo} />
          ))}
        </nav>
        <button
          type="button"
          className="mt-auto cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent narrow:mt-0 narrow:ml-auto"
          onClick={onLogout}
        >
          Выйти
        </button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-8 py-2 max-[900px]:px-4 narrow:static">
          <p className="m-0 min-w-0 text-sm text-muted">{title}</p>
          {topRight ? <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{topRight}</div> : null}
        </header>
        <main
          id="content"
          tabIndex={-1}
          className="min-w-0 px-8 pt-6 pb-12 focus:outline-none max-[900px]:px-4 max-[900px]:pt-5 max-[900px]:pb-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function NavButton({ item, active, onGo }) {
  return (
    <button
      type="button"
      className={
        active
          ? "cursor-pointer rounded-lg border border-transparent bg-accent-soft px-3 py-2 text-left font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          : "cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-2 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      }
      aria-current={active ? "page" : undefined}
      onClick={() => onGo(item.id)}
    >
      {item.text}
    </button>
  );
}

export { Shell };
