import type { ReactNode } from "react";

type Kind = "kw" | "type" | "num" | "str" | "com" | "pp";

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "return", "break", "continue", "switch", "case", "default", "goto", "sizeof",
  "new", "delete", "this", "operator", "template", "typename", "class", "struct", "union", "enum", "namespace", "using",
  "public", "private", "protected", "virtual", "static", "const", "volatile", "extern", "inline", "constexpr", "register",
  "mutable", "friend", "typedef", "throw", "try", "catch", "nullptr", "true", "false", "static_cast", "reinterpret_cast",
  "const_cast", "dynamic_cast", "decltype", "alignof", "noexcept", "and", "or", "not", "xor", "bitand", "bitor", "compl",
  "and_eq", "or_eq", "xor_eq", "not_eq",
]);
const TYPES = new Set([
  "int", "char", "short", "long", "unsigned", "signed", "float", "double", "void", "bool", "auto", "wchar_t", "size_t",
]);

// Ordered alternatives; group index maps to the token kind. A preprocessor line (# or the %: digraph) is only
// recognised at the start of a line, which the caller checks before trying that alternative.
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(0[xX][0-9a-fA-F']+[uUlL]*|\d[\d']*(?:\.\d*)?(?:[eE][+-]?\d+)?[uUlLfF]*)|([A-Za-z_]\w*)/y;
const DIRECTIVE = /[ \t]*(?:#|%:)[^\n]*/y;

export function tokenize(code: string): Array<string | { readonly kind: Kind; readonly text: string }> {
  const out: Array<string | { readonly kind: Kind; readonly text: string }> = [];
  let plain = "";
  let index = 0;
  const push = (kind: Kind, text: string) => {
    if (plain) out.push(plain);
    plain = "";
    out.push({ kind, text });
  };
  while (index < code.length) {
    if (index === 0 || code[index - 1] === "\n") {
      DIRECTIVE.lastIndex = index;
      const directive = DIRECTIVE.exec(code);
      if (directive) {
        push("pp", directive[0]);
        index += directive[0].length;
        continue;
      }
    }
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(code);
    if (!match) {
      plain += code[index];
      index += 1;
      continue;
    }
    const [text, comment, literal, number, word] = match;
    if (comment) push("com", text);
    else if (literal) push("str", text);
    else if (number) push("num", text);
    else if (word && KEYWORDS.has(word)) push("kw", text);
    else if (word && TYPES.has(word)) push("type", text);
    else plain += text;
    index += text.length;
  }
  if (plain) out.push(plain);
  return out;
}

/** Basic C++ colouring for read-only code: the text is unchanged, only wrapped in token spans. */
export function Code({ text }: { readonly text: string }): ReactNode {
  return tokenize(text).map((token, position) => typeof token === "string"
    ? token
    : <span key={position} className={`tok-${token.kind}`}>{token.text}</span>);
}
