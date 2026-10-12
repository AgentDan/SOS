function ErrorBlock({ lines }) {
  return (
    <div
      className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[10px] border-l-4 border-l-[#8e1d1d] dark:border-l-[#ffb4b4] bg-[#fde8e8] dark:bg-[#3a1c1c] px-3 py-2.5 text-[#8e1d1d] dark:text-[#ffb4b4]"
      role="alert"
    >
      <span className="font-bold">Ошибка</span>
      <ul className="m-0 list-disc pl-[1.1rem] [&_li]:my-0.5 [&_li]:[overflow-wrap:anywhere]">
        {lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export { ErrorBlock };
