import { banner, bannerTone, bannerWord, errorLines } from "../styles/classes.js";

function ErrorBlock({ lines }) {
  return (
    <div className={`${banner} ${bannerTone.error}`} role="alert">
      <span className={bannerWord}>Ошибка</span>
      <ul className={errorLines}>
        {lines.map((line, index) => (
          <li key={`${index}:${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export { ErrorBlock };
