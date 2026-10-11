function ErrorBlock({ lines }) {
  return (
    <div className="banner banner-error" role="alert">
      <span className="banner-word">Ошибка</span>
      <ul className="error-lines">
        {lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export { ErrorBlock };
