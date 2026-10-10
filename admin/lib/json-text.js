function spot(text, index, detail) {
  const clamped = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < clamped; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { position: clamped, line, column, detail };
}

function fail(state, index, detail) {
  const error = new Error(detail);
  error.spot = spot(state.text, index, detail);
  throw error;
}

function peek(state) {
  return state.text[state.i];
}

function skip(state) {
  const source = state.text;
  while (state.i < source.length) {
    const char = source[state.i];
    if (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") break;
    state.i += 1;
  }
}

function parseLiteral(state, word) {
  if (state.text.startsWith(word, state.i)) {
    state.i += word.length;
    return;
  }
  fail(state, state.i, "ожидалось значение");
}

function parseNumber(state) {
  const source = state.text;
  const start = state.i;
  let i = start;
  if (source[i] === "-") i += 1;
  if (source[i] === "0") i += 1;
  else if (source[i] >= "1" && source[i] <= "9") {
    while (source[i] >= "0" && source[i] <= "9") i += 1;
  } else {
    fail(state, start, "некорректное число");
  }
  if (source[i] === ".") {
    i += 1;
    if (!(source[i] >= "0" && source[i] <= "9")) fail(state, start, "некорректное число");
    while (source[i] >= "0" && source[i] <= "9") i += 1;
  }
  if (source[i] === "e" || source[i] === "E") {
    i += 1;
    if (source[i] === "+" || source[i] === "-") i += 1;
    if (!(source[i] >= "0" && source[i] <= "9")) fail(state, start, "некорректное число");
    while (source[i] >= "0" && source[i] <= "9") i += 1;
  }
  state.i = i;
}

function parseString(state) {
  const source = state.text;
  const start = state.i;
  if (source[state.i] !== '"') fail(state, state.i, "ожидалась кавычка");
  state.i += 1;
  while (state.i < source.length) {
    const char = source[state.i];
    if (char === '"') {
      state.i += 1;
      return;
    }
    if (char === "\\") {
      const escaped = source[state.i + 1];
      if ("\"\\/bfnrt".includes(escaped)) {
        state.i += 2;
        continue;
      }
      if (escaped === "u" && /^[0-9a-fA-F]{4}$/.test(source.slice(state.i + 2, state.i + 6))) {
        state.i += 6;
        continue;
      }
      fail(state, state.i, "некорректная escape-последовательность");
    }
    if (char < " ") fail(state, state.i, "недопустимый символ в строке");
    state.i += 1;
  }
  fail(state, start, "строка не закрыта");
}

function parseValue(state) {
  skip(state);
  const char = peek(state);
  if (char === "{") return parseObject(state);
  if (char === "[") return parseArray(state);
  if (char === '"') return parseString(state);
  if (char === "t") return parseLiteral(state, "true");
  if (char === "f") return parseLiteral(state, "false");
  if (char === "n") return parseLiteral(state, "null");
  if (char === "-" || (char >= "0" && char <= "9")) return parseNumber(state);
  if (char === undefined) fail(state, state.i, "неожиданный конец текста");
  fail(state, state.i, "ожидалось значение");
}

function parseObject(state) {
  if (peek(state) !== "{") fail(state, state.i, "ожидалось значение");
  state.i += 1;
  skip(state);
  if (peek(state) === "}") {
    state.i += 1;
    return;
  }
  while (state.i <= state.text.length) {
    skip(state);
    if (peek(state) !== '"') fail(state, state.i, "ожидалось имя поля в кавычках");
    parseString(state);
    skip(state);
    if (peek(state) !== ":") fail(state, state.i, "ожидалось двоеточие");
    state.i += 1;
    parseValue(state);
    skip(state);
    if (peek(state) === ",") {
      state.i += 1;
      skip(state);
      if (peek(state) === "}") fail(state, state.i, "лишняя запятая");
      continue;
    }
    if (peek(state) === "}") {
      state.i += 1;
      return;
    }
    fail(state, state.i, "ожидалась запятая или закрывающая скобка");
  }
}

function parseArray(state) {
  if (peek(state) !== "[") fail(state, state.i, "ожидалось значение");
  state.i += 1;
  skip(state);
  if (peek(state) === "]") {
    state.i += 1;
    return;
  }
  while (state.i <= state.text.length) {
    parseValue(state);
    skip(state);
    if (peek(state) === ",") {
      state.i += 1;
      skip(state);
      if (peek(state) === "]") fail(state, state.i, "лишняя запятая");
      continue;
    }
    if (peek(state) === "]") {
      state.i += 1;
      return;
    }
    fail(state, state.i, "ожидалась запятая или закрывающая скобка");
  }
}

function scanJson(text) {
  const state = { text, i: 0 };
  try {
    skip(state);
    if (state.i >= text.length) return spot(text, 0, "пустой текст");
    parseValue(state);
    skip(state);
    if (state.i < text.length) return spot(text, state.i, "лишний текст после значения");
    return null;
  } catch (err) {
    if (err && err.spot) return err.spot;
    return spot(text, state.i, "не удалось разобрать JSON");
  }
}

function fromEngineMessage(text, message) {
  const positionMatch = /position (\d+)/.exec(message);
  if (!positionMatch) return null;
  const found = spot(text, Number(positionMatch[1]), "не удалось разобрать JSON");
  const lineMatch = /line (\d+)/.exec(message);
  const columnMatch = /column (\d+)/.exec(message);
  if (lineMatch) found.line = Number(lineMatch[1]);
  if (columnMatch) found.column = Number(columnMatch[1]);
  return found;
}

function failureMessage(found) {
  const reason = found.detail
    ? `${found.detail.charAt(0).toUpperCase()}${found.detail.slice(1)}.`
    : "";
  const where = `Не удалось прочитать JSON: строка ${found.line}, позиция ${found.column}`;
  return reason ? `${where}. ${reason}` : where;
}

function parseJsonText(text) {
  if (typeof text !== "string") {
    const found = spot("", 0, "пустой текст");
    return { ok: false, ...found, message: failureMessage(found) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const found = scanJson(text) || fromEngineMessage(text, String(err && err.message)) || spot(text, 0, "не удалось разобрать JSON");
    return { ok: false, ...found, message: failureMessage(found) };
  }
}

export { parseJsonText, spot };
