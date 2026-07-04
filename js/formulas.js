/**
 * formulas.js — a small self-contained formula engine for the Sheets tab.
 * Supports + - * / ^, parentheses, cell refs (A1), ranges (A1:B9), and
 * SUM/AVERAGE/MIN/MAX/COUNT/ROUND/ABS/IF/CONCAT. Recalculation is brute
 * force (every formula cell re-evaluates on any edit) — deliberately simple
 * for a "light" sheet size; a dependency graph would be the next step if
 * grids grow much larger.
 */

const FUNCS = {
  SUM: (args) => flat(args).reduce((a, b) => a + (num(b) || 0), 0),
  AVERAGE: (args) => {
    const nums = flat(args).map(num).filter((n) => n !== null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  },
  MIN: (args) => Math.min(...flat(args).map((v) => num(v) ?? Infinity)),
  MAX: (args) => Math.max(...flat(args).map((v) => num(v) ?? -Infinity)),
  COUNT: (args) => flat(args).filter((v) => num(v) !== null).length,
  ROUND: (args) => {
    const [v, d] = args;
    const digits = d !== undefined ? num(d) : 0;
    const factor = Math.pow(10, digits || 0);
    return Math.round((num(v) || 0) * factor) / factor;
  },
  ABS: (args) => Math.abs(num(args[0]) || 0),
  IF: (args) => (truthy(args[0]) ? args[1] : args[2]),
  CONCAT: (args) => flat(args).map((v) => (v === null || v === undefined ? "" : String(v))).join(""),
};

function flat(args) {
  const out = [];
  for (const a of args) {
    if (Array.isArray(a)) out.push(...flat(a));
    else out.push(a);
  }
  return out;
}
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}
function truthy(v) {
  if (typeof v === "string") return v.length > 0 && v !== "0" && v.toUpperCase() !== "FALSE";
  return !!v;
}

export function colToIndex(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n - 1;
}
export function indexToCol(idx) {
  let n = idx + 1,
    s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: colToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

class Tokenizer {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.tokens = [];
    this.run();
  }
  run() {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i];
      if (/\s/.test(c)) { this.i++; continue; }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[this.i + 1] || ""))) {
        let j = this.i, str = "";
        while (j < s.length && /[0-9.]/.test(s[j])) { str += s[j]; j++; }
        this.tokens.push({ t: "NUM", v: parseFloat(str) });
        this.i = j;
        continue;
      }
      if (/[A-Za-z]/.test(c)) {
        let j = this.i, str = "";
        while (j < s.length && /[A-Za-z0-9]/.test(s[j])) { str += s[j]; j++; }
        if (s[j] === ":" && /^[A-Za-z]+[0-9]+$/.test(str)) {
          let k = j + 1, str2 = "";
          while (k < s.length && /[A-Za-z0-9]/.test(s[k])) { str2 += s[k]; k++; }
          if (/^[A-Za-z]+[0-9]+$/.test(str2)) {
            this.tokens.push({ t: "RANGE", v: [str.toUpperCase(), str2.toUpperCase()] });
            this.i = k;
            continue;
          }
        }
        if (/^[A-Za-z]+[0-9]+$/.test(str)) {
          this.tokens.push({ t: "CELL", v: str.toUpperCase() });
        } else {
          this.tokens.push({ t: "FUNC", v: str.toUpperCase() });
        }
        this.i = j;
        continue;
      }
      if (c === '"') {
        let j = this.i + 1, str = "";
        while (j < s.length && s[j] !== '"') { str += s[j]; j++; }
        this.tokens.push({ t: "STR", v: str });
        this.i = j + 1;
        continue;
      }
      if ("+-*/^(),%".includes(c)) {
        this.tokens.push({ t: c });
        this.i++;
        continue;
      }
      this.i++; // skip unknown char
    }
  }
}

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx; // { getCell(ref), getRange(a,b) }
  }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  parse() {
    const v = this.expr();
    return v;
  }
  expr() {
    let left = this.term();
    while (this.peek() && (this.peek().t === "+" || this.peek().t === "-")) {
      const op = this.next().t;
      const right = this.term();
      left = op === "+" ? (num(left) || 0) + (num(right) || 0) : (num(left) || 0) - (num(right) || 0);
    }
    return left;
  }
  term() {
    let left = this.power();
    while (this.peek() && (this.peek().t === "*" || this.peek().t === "/")) {
      const op = this.next().t;
      const right = this.power();
      left = op === "*" ? (num(left) || 0) * (num(right) || 0) : (num(left) || 0) / (num(right) || 1);
    }
    return left;
  }
  power() {
    let left = this.unary();
    if (this.peek() && this.peek().t === "^") {
      this.next();
      const right = this.power();
      left = Math.pow(num(left) || 0, num(right) || 0);
    }
    return left;
  }
  unary() {
    if (this.peek() && this.peek().t === "-") {
      this.next();
      return -(num(this.unary()) || 0);
    }
    return this.primary();
  }
  primary() {
    const tk = this.peek();
    if (!tk) return null;
    if (tk.t === "NUM") { this.next(); return tk.v; }
    if (tk.t === "STR") { this.next(); return tk.v; }
    if (tk.t === "CELL") { this.next(); return this.ctx.getCell(tk.v); }
    if (tk.t === "RANGE") { this.next(); return this.ctx.getRange(tk.v[0], tk.v[1]); }
    if (tk.t === "(") {
      this.next();
      const v = this.expr();
      if (this.peek() && this.peek().t === ")") this.next();
      return v;
    }
    if (tk.t === "FUNC") {
      this.next();
      const name = tk.v;
      const args = [];
      if (this.peek() && this.peek().t === "(") {
        this.next();
        if (this.peek() && this.peek().t !== ")") {
          args.push(this.expr());
          while (this.peek() && this.peek().t === ",") {
            this.next();
            args.push(this.expr());
          }
        }
        if (this.peek() && this.peek().t === ")") this.next();
      }
      const fn = FUNCS[name];
      if (!fn) return "#NAME?";
      try { return fn(args); } catch { return "#ERROR"; }
    }
    this.next();
    return null;
  }
}

/**
 * Evaluate a formula string (without the leading "=") against a lookup
 * context. getCell(ref) and getRange(a,b) let the sheet control how blank
 * cells / circular refs behave.
 */
export function evaluate(formula, ctx) {
  try {
    const tokens = new Tokenizer(formula).tokens;
    const result = new Parser(tokens, ctx).parse();
    if (typeof result === "number" && !isFinite(result)) return "#DIV/0!";
    return result;
  } catch {
    return "#ERROR";
  }
}
