/* Общая рама страницы: фон, текст и шрифт для входа, загрузки и приложения. */
function AppFrame({ children }) {
  return (
    <div className="box-border min-h-screen bg-paper font-sans text-[16px] leading-[1.45] text-ink [&_*]:box-border">
      {children}
    </div>
  );
}

export { AppFrame };
