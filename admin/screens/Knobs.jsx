import { useEffect, useRef, useState } from "react";
import { isAbort, listKnobs, updateKnob } from "../api/admin-api.js";
import {
  boundsText,
  checkKnobValue,
  describeKnobValues,
  groupKnobsByLayer,
  knobTitle,
  readEnumValue
} from "../lib/knobs.js";
import { problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { Banner } from "../components/Banner.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";

function readControl(knob, control) {
  if (!control) return undefined;
  if (knob.type === "boolean") return control.checked;
  if (knob.type === "number") {
    if (control.value.trim() === "") return undefined;
    const numeric = Number(control.value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (knob.type === "enum") return readEnumValue(knob, control.value);
  return control.value;
}

function BooleanField({ value, inputRef }) {
  const [checked, setChecked] = useState(value === true);
  return (
    <label className="flex items-center gap-2">
      <input
        ref={inputRef}
        className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        type="checkbox"
        defaultChecked={value === true}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <span>{checked ? "Включено" : "Выключено"}</span>
    </label>
  );
}

function EnumField({ knob, value, inputRef }) {
  const options = Array.isArray(knob.options) ? knob.options : [];
  const extra =
    value != null && !options.some((option) => option === value || String(option) === String(value));
  return (
    <select
      ref={inputRef}
      className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      defaultValue={value == null ? undefined : String(value)}
    >
      {extra ? <option value={String(value)}>{String(value)}</option> : null}
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  );
}

function KnobControl({ knob, value, inputRef }) {
  if (knob.type === "boolean") return <BooleanField value={value} inputRef={inputRef} />;
  if (knob.type === "enum") return <EnumField knob={knob} value={value} inputRef={inputRef} />;
  if (knob.type === "number") {
    return (
      <input
        ref={inputRef}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        type="number"
        step="any"
        min={typeof knob.min === "number" ? String(knob.min) : undefined}
        max={typeof knob.max === "number" ? String(knob.max) : undefined}
        defaultValue={typeof value === "number" && Number.isFinite(value) ? String(value) : undefined}
      />
    );
  }
  return (
    <input
      ref={inputRef}
      className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      type="text"
      autoComplete="off"
      defaultValue={typeof value === "string" ? value : undefined}
    />
  );
}

function KnobRow({ knob, row, hideKey, working, onApply }) {
  const inputRef = useRef(null);
  const [slot, setSlot] = useState(null);

  if (!row.applicable) {
    return (
      <div className="grid grid-cols-[minmax(90px,160px)_minmax(0,1fr)_auto] items-center gap-2">
        {hideKey ? null : <span className="font-[650] [overflow-wrap:anywhere]">{row.label}</span>}
        <Banner kind="warn" text="В данных нет места, куда записать значение" />
      </div>
    );
  }

  return (
    <div
      className={
        hideKey
          ? "grid grid-cols-[minmax(0,280px)_auto] items-center gap-2"
          : "grid grid-cols-[minmax(90px,160px)_minmax(0,1fr)_auto] items-center gap-2"
      }
    >
      {hideKey ? null : <span className="font-[650] [overflow-wrap:anywhere]">{row.label}</span>}
      <KnobControl knob={knob} value={row.value} inputRef={inputRef} />
      <button
        type="button"
        className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        disabled={working}
        onClick={() => onApply(knob, row, readControl(knob, inputRef.current), setSlot)}
      >
        Применить
      </button>
      <div className="col-span-full empty:hidden">{slot}</div>
    </div>
  );
}

function KnobCard({ knob, working, onApply }) {
  const described = describeKnobValues(knob);
  const bounds = boundsText(knob);
  let body = null;
  if (described.broken) {
    body = <Banner kind="warn" text="В данных нет значения для этой ручки" />;
  } else if (described.multiple) {
    body = (
      <div className="flex flex-col gap-2">
        {described.rows.map((row) => (
          <KnobRow
            key={row.at || row.label}
            knob={knob}
            row={row}
            working={working}
            onApply={onApply}
          />
        ))}
      </div>
    );
  } else {
    body = <KnobRow knob={knob} row={described.rows[0]} hideKey working={working} onApply={onApply} />;
  }

  return (
    <article className="mb-3 rounded-xl border border-line bg-surface px-4 py-3.5">
      <h3 className="mt-0 mb-1.5 font-[650] leading-tight text-[1.02rem]">{knobTitle(knob)}</h3>
      {knob && knob.description ? <p className="mt-0 mb-2">{String(knob.description)}</p> : null}
      {bounds ? <p className="mt-0 mb-2 text-muted">{`Границы: ${bounds}`}</p> : null}
      <p className="mt-0 mb-2 text-muted">{`Раздел: ${sectionLabel(knob && knob.section)}`}</p>
      {body}
    </article>
  );
}

function Knobs({ openSection }) {
  const [view, setView] = useState({ kind: "loading" });
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const aliveRef = useRef(true);
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    listKnobs({ signal: controller.signal })
      .then((list) => {
        if (!aliveRef.current) return;
        const source = Array.isArray(list) ? list : [];
        const productKnobs = source.filter((knob) => knob && typeof knob === "object" && knob.layer !== "dialog");
        setView({ kind: "ready", groups: groupKnobsByLayer(productKnobs) });
      })
      .catch((err) => {
        if (!aliveRef.current || isAbort(err) || err.status === 401) return;
        setView({ kind: "error", lines: problemLines(err.status, err.body) });
      });
    return () => {
      aliveRef.current = false;
      controller.abort();
    };
  }, []);

  async function onApply(knob, row, value, setSlot) {
    if (workingRef.current) return;
    const localErrors = checkKnobValue(knob, value);
    if (localErrors.length > 0) {
      setSlot(<ErrorBlock lines={localErrors} />);
      return;
    }
    workingRef.current = true;
    setWorking(true);
    setSlot(<Loading text="Записываем…" />);
    try {
      await updateKnob(knob.id, row.at, value, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      setSlot(
        <>
          <Banner kind="ok" text="Записано в черновик, клиент увидит после публикации раздела" />
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => openSection(knob.section)}
          >
            Опубликовать раздел
          </button>
        </>
      );
    } catch (err) {
      if (!aliveRef.current || isAbort(err) || err.status === 401) return;
      setSlot(<ErrorBlock lines={problemLines(err.status, err.body)} />);
    } finally {
      if (aliveRef.current) {
        workingRef.current = false;
        setWorking(false);
      }
    }
  }

  if (view.kind === "loading") return <Loading />;
  if (view.kind === "error") {
    return (
      <>
        <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Ручки продукта</h1>
        <ErrorBlock lines={view.lines} />
      </>
    );
  }

  return (
    <>
      <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Ручки продукта</h1>
      <p className="mt-0 mb-2 text-muted">Значение попадает в черновик раздела. Клиент увидит его только после публикации.</p>
      <p className="mt-0 mb-2 text-muted">Ручки диалога находятся на экране „Диалог“.</p>
      {view.groups.length > 0 ? (
        view.groups.map((group) => (
          <section key={group.layer || group.title}>
            <h2 className="mt-0 mb-2.5 font-[650] leading-tight text-[1.15rem]">{group.title}</h2>
            {group.knobs.map((knob) => (
              <KnobCard key={knob.id || knobTitle(knob)} knob={knob} working={working} onApply={onApply} />
            ))}
          </section>
        ))
      ) : (
        <p className="mt-0 mb-2 text-muted">Ручек продукта пока нет</p>
      )}
    </>
  );
}

export { Knobs };
