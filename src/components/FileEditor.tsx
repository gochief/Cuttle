import { useRef, useEffect } from "react";
import type { ImageAsset } from "../mygo";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { FileBuffer } from "../app/types";
import { parseFrontmatter } from "../lib/frontmatter";
import { useEditorSyntax } from "../hooks/useEditorSyntax";
const editorTheme = EditorView.theme({
  "&": { backgroundColor: "var(--surface)", color: "var(--text)" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--text-faint)",
    border: "none",
  },
  ".cm-activeLine,.cm-activeLineGutter": {
    backgroundColor: "var(--surface-subtle)",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground,.cm-selectionBackground": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-content": { caretColor: "var(--accent)" },
});
type Props = {
  file: FileBuffer;
  form: boolean;
  language: string;
  onLanguage: (language: string) => void;
  onEdit: (text: string) => void;
  onError: (error: string) => void;
  onReplace: () => void;
  onImportImage: () => Promise<ImageAsset | undefined>;
};
export default function FileEditor({
  file,
  form,
  language,
  onLanguage,
  onEdit,
  onError,
  onReplace,
  onImportImage,
}: Props) {
  const editor = useRef<EditorView | null>(null);
  useEffect(
    () => () => {
      editor.current = null;
    },
    [],
  );
  async function insertImage() {
    const view = editor.current;
    if (!view) return;
    const selection = view.state.selection.main;
    const asset = await onImportImage();
    if (!asset?.path || view !== editor.current) return;
    const insert = "\n" + asset.markdown + "\n";
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      scrollIntoView: true,
    });
    view.focus();
  }
  const syntax = useEditorSyntax(file.path);
  const isMarkdown = /\.(md|markdown)$/i.test(file.path);
  const { doc, body } = parseFrontmatter(file.text);
  function metadata(key: string, value: string) {
    if (doc.errors.length) {
      onError("YAML 格式错误，请在源码模式修正");
      return;
    }
    doc.set(key, value);
    onEdit("---\n" + doc.toString() + "---\n" + body);
  }
  const basicExtensions = [editorTheme, EditorView.lineWrapping];
  return (
    <div className="editor">
      {isMarkdown && !file.binary && (
        <div className="article-assets">
          <button
            onClick={() =>
              insertImage().catch((error) => onError(String(error)))
            }
          >
            ＋ 插入图片
          </button>
          <small>导入到 assets/images · 插入当前光标位置</small>
        </div>
      )}
      {file.draftConflict && (
        <details className="draft-comparison">
          <summary>恢复的草稿与磁盘文件不同，点击查看磁盘版本</summary>
          <pre>{file.content}</pre>
          <button onClick={() => onEdit(file.content)}>使用磁盘内容</button>
        </details>
      )}
      {file.binary ? (
        <div className="binary">
          <p>
            {file.mime || "二进制文件"} · {(file.size / 1024).toFixed(1)} KB
          </p>
          {file.mime.startsWith("image/") ? (
            <img
              alt={file.path}
              src={`data:${file.mime};base64,${file.data}`}
            />
          ) : (
            <p>此文件通过系统应用查看。可使用文件菜单导入替换。</p>
          )}
          <button onClick={onReplace}>替换文件…</button>
        </div>
      ) : form && isMarkdown ? (
        <>
          <div className="metadata">
            <div className="language">
              <button
                className={language === "zh" ? "on" : ""}
                onClick={() => onLanguage("zh")}
              >
                中文
              </button>
              <button
                className={language === "en" ? "on" : ""}
                onClick={() => onLanguage("en")}
              >
                English
              </button>
              <span>文章信息</span>
            </div>
            {(language === "zh"
              ? ["title", "date", "summary"]
              : ["title_en", "summary_en"]
            ).map((key) => (
              <label key={key}>
                {
                  (
                    {
                      title: "标题",
                      date: "日期",
                      summary: "摘要",
                      title_en: "英文标题",
                      summary_en: "英文摘要",
                    } as Record<string, string>
                  )[key]
                }
                <input
                  value={String(doc.get(key) || "")}
                  onChange={(event) => metadata(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <CodeMirror
            key={file.path + language + String(form)}
            onCreateEditor={(view) => {
              editor.current = view;
            }}
            value={
              language === "en" ? String(doc.get("content_en") || "") : body
            }
            extensions={[...basicExtensions, markdown()]}
            height="100%"
            onChange={(text) =>
              language === "en"
                ? metadata("content_en", text)
                : onEdit("---\n" + doc.toString() + "---\n" + text)
            }
          />
        </>
      ) : (
        <CodeMirror
          key={file.path + String(form)}
          onCreateEditor={(view) => {
            editor.current = view;
          }}
          value={file.text}
          height="100%"
          extensions={[
            ...basicExtensions,
            ...(isMarkdown ? [markdown()] : syntax),
          ]}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={onEdit}
        />
      )}
    </div>
  );
}
