import { useEffect, useState } from "react";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
export function useEditorSyntax(path: string) {
  const [syntax, setSyntax] = useState<Extension[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSyntax([]);
    const lang = LanguageDescription.matchFilename(languages, path);
    lang
      ?.load()
      .then((extension) => {
        if (!cancelled) setSyntax([extension]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);
  return syntax;
}
