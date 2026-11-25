import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { parseDocument } from "yaml";
import {
  Studio,
  type Project,
  type File as ProjectFile,
  type Entry,
  type Status,
  type Review,
  type Match,
} from "./mygo";
import { on } from "mygo-runtime";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import "./style.css";
type Buffer = ProjectFile & { text: string };
function App() {
  const [project, setProject] = useState<Project>();
  const [recent, setRecent] = useState<Project[]>([]);
  const [status, setStatus] = useState<Status>();
  const [tree, setTree] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [hidden, setHidden] = useState(false);
  const [buffers, setBuffers] = useState<Buffer[]>([]);
  const [active, setActive] = useState("");
  const [view, setView] = useState("files");
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review>();
  const [push, setPush] = useState(true);
  const [stash, setStash] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [syntax, setSyntax] = useState<Extension[]>([]);
  const [preview, setPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState(false);
  const [language, setLanguage] = useState("zh");
  const current = buffers.find((b) => b.path === active);
  const refs = useRef({ project, buffers, busy });
  refs.current = { project, buffers, busy };
  const dirty = (b: Buffer) => b.text !== b.content;
  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
      return undefined;
    } finally {
      setBusy("");
    }
  }
  async function refresh(p = project) {
    if (!p) return;
    setStatus(await Studio.status(p.id));
    setTree({ "": await Studio.list(p.id, "", hidden) });
    setExpanded([]);
  }
  async function drafts() {
    const { project: p, buffers: bs } = refs.current;
    if (p)
      for (const b of bs)
        if (dirty(b))
          await Studio.saveDraft(p.id, b.path, b.text, b.revision, b.branch);
  }
  async function openProject(root: string) {
    await drafts();
    const p = await Studio.openProject(root);
    setProject(p);
    setBuffers([]);
    setActive("");
    setPreview("");
    setSelected([]);
    setFolder("");
    setRecent(await Studio.recent());
    await refresh(p);
    setModal("");
  }
  useEffect(
    () =>
      on<boolean>("studioClosing", () => {
        if (refs.current.busy) {
          setError("当前操作尚未结束，请等待完成后关闭窗口。");
          return;
        }
        drafts()
          .then(() => Studio.closeReady())
          .catch((e) => setError("草稿保存失败，窗口保持打开：" + String(e)));
      }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const lang = LanguageDescription.matchFilename(languages, active);
    if (lang)
      lang
        .load()
        .then((x) => {
          if (!cancelled) setSyntax([x]);
        })
        .catch((e) => setError(String(e)));
    else setSyntax([]);
    return () => {
      cancelled = true;
    };
  }, [active]);
  useEffect(() => {
    Studio.recent()
      .then(setRecent)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (project) run("读取项目", () => refresh());
  }, [hidden]);
  useEffect(() => {
    const timer = setTimeout(
      () => drafts().catch((e) => setError(String(e))),
      600,
    );
    return () => clearTimeout(timer);
  }, [buffers]);
  useEffect(() => {
    if (!project) return;
    const t = setInterval(
      () =>
        Studio.status(project.id)
          .then(setStatus)
          .catch(() => {}),
      5000,
    );
    return () => clearInterval(t);
  }, [project]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!refs.current.busy) run("保存文件", saveAll);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project, buffers]);
  async function saveAll() {
    if (!project) return;
    for (const b of buffers)
      if (dirty(b)) {
        const f = await Studio.save(
          project.id,
          b.path,
          b.text,
          b.revision,
          b.branch,
        );
        setBuffers((bs) =>
          bs.map((x) => (x.path === b.path ? { ...f, text: f.content } : x)),
        );
      }
    setStatus(await Studio.status(project.id));
    setNotice("文件已保存");
  }
  async function read(path: string, reload = false) {
    if (!project) return;
    if (reload) await drafts();
    if (!reload && buffers.some((b) => b.path === path)) {
      setActive(path);
      return;
    }
    const f = await Studio.read(project.id, path);
    const text = f.hasDraft ? f.draft : f.content;
    setBuffers((bs) => [...bs.filter((b) => b.path !== path), { ...f, text }]);
    setActive(path);
    setPreview("");
    if (f.hasDraft)
      setNotice(
        f.draftConflict
          ? "检测到恢复草稿与磁盘内容冲突，请比较后保存。"
          : "已恢复上次未保存的草稿",
      );
  }
  function edit(text: string) {
    setBuffers((bs) => bs.map((b) => (b.path === active ? { ...b, text } : b)));
  }
  function dialog(kind: string, v: Record<string, string> = {}) {
    setValues(v);
    setModal(kind);
    setError("");
  }
  const field = (
    key: string,
    label: string,
    placeholder = "",
    type = "text",
  ) => (
    <label>
      {label}
      <input
        type={type}
        value={values[key] || ""}
        placeholder={placeholder}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </label>
  );
  async function network(action: string) {
    if (!project) return;
    await saveAll();
    setStatus(
      await Studio.network(
        project.id,
        action,
        values.remote || status?.remotes[0]?.name || "origin",
      ),
    );
    setNotice(action + " 完成");
    if (action === "pull" || action === "stash-pop") {
      setBuffers([]);
      setActive("");
      await refresh();
    }
  }
  async function buildPreview(kind: string) {
    if (!project || !current) return;
    let content = current.text;
    if (kind === "markdown" && language === "en" && form) {
      content = String(frontmatter().doc.get("content_en") || "");
    }
    const r = await Studio.preview(project.id, current.path, content, kind);
    setPreview(r.url);
    setShowPreview(true);
  }
  function renderEntries(dir: string, depth = 0): React.ReactNode {
    return (tree[dir] || []).map((e) => (
      <React.Fragment key={e.path}>
        <div
          className={"file-row " + (active === e.path ? "active" : "")}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() =>
            run("打开文件", async () => {
              if (e.directory) {
                setFolder(e.path);
                if (expanded.includes(e.path))
                  setExpanded((x) => x.filter((a) => a !== e.path));
                else {
                  setTree((x) => ({ ...x, [e.path]: [] }));
                  const rows = await Studio.list(project!.id, e.path, hidden);
                  setTree((x) => ({ ...x, [e.path]: rows }));
                  setExpanded((x) => [...x, e.path]);
                }
              } else await read(e.path);
            })
          }
        >
          <span>
            {e.directory ? (expanded.includes(e.path) ? "▾" : "▸") : "·"}
          </span>
          <span className="filename">
            {e.name}
            {e.link ? " ↗" : ""}
          </span>
          <button
            className="row-action"
            title="文件操作"
            onClick={(ev) => {
              ev.stopPropagation();
              dialog("file", {
                path: e.path,
                directory: String(e.directory),
                to: e.path,
              });
            }}
          >
            ⋯
          </button>
        </div>
        {e.directory &&
          expanded.includes(e.path) &&
          renderEntries(e.path, depth + 1)}
      </React.Fragment>
    ));
  }
  const isMarkdown = current && /\.(md|markdown)$/i.test(current.path);
  function frontmatter() {
    if (!current) return { doc: parseDocument(""), body: "" };
    const m = current.text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    return {
      doc: parseDocument(m?.[1] || ""),
      body: m ? current.text.slice(m[0].length) : current.text,
    };
  }
  const fm = frontmatter();
  function metadata(key: string, value: string) {
    const { doc, body } = frontmatter();
    if (doc.errors.length) {
      setError("YAML 格式错误，请在源码模式修正");
      return;
    }
    doc.set(key, value);
    edit("---\n" + doc.toString() + "---\n" + body);
  }
  async function submitModal() {
    if (!project && modal !== "clone" && modal !== "open") return;
    const p = project!;
    if (modal === "open") {
      await openProject(values.path);
      return;
    }
    if (modal === "clone") {
      const result = await Studio.clone(values.url, values.parent, values.name);
      await openProject(result.root);
      return;
    }
    if (modal === "create" || modal === "article") {
      const path =
        modal === "article"
          ? `_posts/${values.date}-${values.slug}.md`
          : values.path;
      await Studio.create(p.id, path, values.directory === "true");
      if (modal === "article") {
        const f = await Studio.read(p.id, path);
        const text = `---\nlayout: post\ntitle: ${JSON.stringify(values.title || "新文章")}\ndate: ${values.date} 12:00:00 +0800\ncategories: []\nsummary: ""\ntitle_en: ""\nsummary_en: ""\ncontent_en: |\n  \n---\n\n开始写作。\n`;
        await Studio.save(p.id, path, text, f.revision, f.branch);
      }
      await refresh();
      if (values.directory !== "true") await read(path);
    }
    if (modal === "file") {
      await saveAll();
      await Studio.move(p.id, values.path, values.to);
      setBuffers((bs) =>
        bs.filter(
          (b) =>
            b.path !== values.path && !b.path.startsWith(values.path + "/"),
        ),
      );
      setActive("");
      await refresh();
    }
    if (modal === "branch") {
      await saveAll();
      setStatus(await Studio.switch(p.id, values.branch, stash));
      setBuffers([]);
      setActive("");
      setPreview("");
      setSelected([]);
      await refresh();
    }
    if (modal === "newBranch") {
      await saveAll();
      setStatus(await Studio.newBranch(p.id, values.name));
      setBuffers([]);
      setActive("");
      await refresh();
    }
    if (modal === "remote")
      setStatus(
        await Studio.remote(
          p.id,
          values.name,
          values.fetch,
          values.push,
          false,
        ),
      );
    if (modal === "commit" && review) {
      const r = await Studio.commit(
        p.id,
        review.id,
        values.message,
        push,
        values.remote || "origin",
      );
      setNotice(`已提交 ${r.commit.slice(0, 8)}${r.pushed ? "，已推送" : ""}`);
      await refresh();
      setSelected([]);
      if (r.pushError) {
        setError("提交成功，推送失败。可通过顶部“推送”重试：" + r.pushError);
      }
    }
    setModal("");
  }
  return (
    <div className="app" inert={busy ? true : undefined} aria-busy={!!busy}>
      <header>
        <div className="brand">
          <span className="logo">C</span>
          <div>
            Cuttle
            <small>LOCAL WORKSPACE</small>
          </div>
        </div>
        <select
          aria-label="切换项目"
          value={project?.root || ""}
          onChange={(e) =>
            e.target.value && run("切换项目", () => openProject(e.target.value))
          }
        >
          <option value="">选择项目</option>
          {recent.map((p) => (
            <option key={p.id} value={p.root}>
              {p.name} · {p.root}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            run("打开文件夹", async () => {
              const path = await Studio.pickFolder();
              if (path) await openProject(path);
            })
          }
        >
          打开文件夹
        </button>
        <button onClick={() => dialog("clone")}>克隆</button>
        <div className="spacer" />
        {project?.git && (
          <>
            <button
              onClick={() => dialog("branch", { branch: status?.branch || "" })}
            >
              ⑂ {status?.branch || "分支"}
            </button>
            <button
              onClick={() =>
                dialog("remote", {
                  name: status?.remotes[0]?.name || "origin",
                  fetch: status?.remotes[0]?.fetch || "",
                  push: status?.remotes[0]?.push || "",
                })
              }
            >
              远程仓库
            </button>
          </>
        )}
      </header>
      {!project ? (
        <main className="welcome">
          <p className="eyebrow">YOUR PROJECT, YOUR WORKSPACE</p>
          <h1>把想法写进项目。</h1>
          <p>打开本地文件夹，编辑文件、预览文章，管理 Git 分支与提交。</p>
          <div className="welcome-actions">
            <button
              className="primary"
              onClick={() =>
                run("打开项目", async () => {
                  const path = await Studio.pickFolder();
                  if (path) await openProject(path);
                })
              }
            >
              打开项目文件夹
            </button>
            <button onClick={() => dialog("open")}>输入路径</button>
            <button onClick={() => dialog("clone")}>从 Git 克隆</button>
          </div>
          <div className="recent">
            {recent.map((p) => (
              <button
                key={p.id}
                onClick={() => run("打开项目", () => openProject(p.root))}
              >
                <b>{p.name}</b>
                <small>{p.root}</small>
              </button>
            ))}
          </div>
        </main>
      ) : (
        <>
          <div className="toolbar">
            <div className="breadcrumbs" title={project.root}>
              {project.name}
              <span> / {active || "项目工作区"}</span>
            </div>
            <button onClick={() => run("保存文件", saveAll)}>
              保存全部 ⌘S
            </button>
            {project.jekyll && (
              <button
                onClick={() =>
                  dialog("article", {
                    date: new Date().toLocaleDateString("en-CA"),
                    slug: "new-post",
                    title: "",
                  })
                }
              >
                ＋ 写文章
              </button>
            )}
            {project.git ? (
              <>
                <button onClick={() => run("Fetch", () => network("fetch"))}>
                  Fetch
                </button>
                <button onClick={() => run("拉取", () => network("pull"))}>
                  拉取
                </button>
                <button onClick={() => run("推送", () => network("push"))}>
                  推送 ↑
                </button>
                <button className="primary" onClick={() => setView("git")}>
                  提交改动 {status?.changes.length || 0}
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  run("初始化 Git", async () => {
                    setProject(await Studio.initGit(project.id));
                    await refresh();
                  })
                }
              >
                初始化 Git
              </button>
            )}
          </div>
          <div className="workspace">
            <nav className="rail">
              {[
                ["files", "▤", "文件"],
                ["search", "⌕", "搜索"],
                ["git", "⑂", "Git"],
              ].map(([id, icon, label]) => (
                <button
                  className={view === id ? "chosen" : ""}
                  key={id}
                  title={label}
                  onClick={() => setView(id)}
                >
                  {icon}
                  <small>{label}</small>
                </button>
              ))}
            </nav>
            <aside>
              <div className="panel-title">
                {view === "files"
                  ? "项目文件"
                  : view === "git"
                    ? "源代码管理"
                    : "项目搜索"}
                <button onClick={() => run("刷新", () => refresh())}>↻</button>
              </div>
              {view === "files" ? (
                <>
                  <div className="file-tools">
                    <button
                      title="新文件"
                      onClick={() =>
                        dialog("create", {
                          path: folder ? folder + "/" : "",
                          directory: "false",
                        })
                      }
                    >
                      ＋ 文件
                    </button>
                    <button
                      title="新文件夹"
                      onClick={() =>
                        dialog("create", {
                          path: folder ? folder + "/" : "",
                          directory: "true",
                        })
                      }
                    >
                      ＋ 目录
                    </button>
                    <button
                      title="导入文件"
                      onClick={() =>
                        run("导入", async () => {
                          await Studio.import(project.id, folder, "");
                          await refresh();
                        })
                      }
                    >
                      导入
                    </button>
                  </div>
                  <div className="folder" onClick={() => setFolder("")}>
                    ⌂ /{folder} <small>新文件目标目录</small>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={hidden}
                      onChange={(e) => setHidden(e.target.checked)}
                    />
                    显示隐藏文件与依赖目录
                  </label>
                  <div className="tree">{renderEntries("")}</div>
                </>
              ) : view === "search" ? (
                <>
                  <form
                    className="search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("搜索", async () =>
                        setMatches(
                          await Studio.search(project.id, query, true),
                        ),
                      );
                    }}
                  >
                    <input
                      placeholder="搜索文件名与内容"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button>搜索</button>
                  </form>
                  {matches.map((m, i) => (
                    <button
                      className="result"
                      key={i}
                      onClick={() => run("打开文件", () => read(m.path))}
                    >
                      <b>
                        {m.path}:{m.line}
                      </b>
                      <small>{m.text}</small>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <p className="muted padded">
                    {status?.branch} · ↑{status?.ahead || 0} ↓
                    {status?.behind || 0}
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={
                        !!status?.changes.length &&
                        selected.length === status.changes.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? status?.changes.map((c) => c.path) || []
                            : [],
                        )
                      }
                    />
                    全选改动
                  </label>
                  {status?.changes.map((c) => (
                    <div className="change" key={c.path}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.path)}
                        onChange={(e) =>
                          setSelected((x) =>
                            e.target.checked
                              ? [...x, c.path]
                              : x.filter((a) => a !== c.path),
                          )
                        }
                      />
                      <button
                        onClick={() => run("打开文件", () => read(c.path))}
                      >
                        {c.path}
                        <small>{c.oldPath && "← " + c.oldPath}</small>
                      </button>
                      <code>{c.status}</code>
                    </div>
                  ))}
                  <button
                    className="primary wide"
                    disabled={!selected.length}
                    onClick={() =>
                      run("生成提交预览", async () => {
                        await saveAll();
                        const r = await Studio.review(project.id, selected);
                        setReview(r);
                        dialog("commit", {
                          remote: status?.remotes[0]?.name || "origin",
                        });
                      })
                    }
                  >
                    审阅并提交 {selected.length} 个文件
                  </button>
                  {status?.stashes.length ? (
                    <div className="padded">
                      <h4>暂存记录</h4>
                      {status.stashes.map((s) => (
                        <p key={s} className="muted">
                          {s}
                        </p>
                      ))}
                      <button
                        onClick={() =>
                          run("恢复 stash", () => network("stash-pop"))
                        }
                      >
                        恢复最新 stash
                      </button>
                    </div>
                  ) : null}
                  <pre className="history">{status?.log}</pre>
                </>
              )}
            </aside>
            <section className="editor-area">
              <div className="tabs">
                {buffers.map((b) => (
                  <button
                    key={b.path}
                    className={active === b.path ? "selected" : ""}
                    onClick={() => setActive(b.path)}
                  >
                    {b.path.split("/").pop()}
                    {dirty(b) && <i> ●</i>}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        run("保存草稿", async () => {
                          await drafts();
                          setBuffers((bs) =>
                            bs.filter((x) => x.path !== b.path),
                          );
                          if (active === b.path) setActive("");
                        });
                      }}
                    >
                      {" "}
                      ×
                    </span>
                  </button>
                ))}
              </div>
              {current ? (
                <>
                  <div className="editor-tools">
                    <small>
                      {current.path} ·{" "}
                      {current.binary ? "二进制" : current.branch || "本地文件"}
                    </small>
                    <div className="spacer" />
                    {isMarkdown && (
                      <>
                        <button
                          className={form ? "on" : ""}
                          onClick={() => setForm(!form)}
                        >
                          {form ? "源码编辑" : "文章表单"}
                        </button>
                        <button
                          onClick={() =>
                            run("Markdown 预览", () => buildPreview("markdown"))
                          }
                        >
                          Markdown 预览
                        </button>
                        {project.jekyll && (
                          <button
                            onClick={() =>
                              run("构建 Jekyll 预览", () =>
                                buildPreview("jekyll"),
                              )
                            }
                          >
                            真实博客预览
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() =>
                        run("重新载入", () => read(current.path, true))
                      }
                    >
                      从磁盘重载
                    </button>
                    <button
                      onClick={() =>
                        run("系统打开", () =>
                          Studio.openSystem(project.id, current.path),
                        )
                      }
                    >
                      系统打开
                    </button>
                  </div>
                  <div className="split">
                    <div className="editor">
                      {current.draftConflict && (
                        <details className="draft-comparison">
                          <summary>
                            恢复的草稿与磁盘文件不同，点击查看磁盘版本
                          </summary>
                          <pre>{current.content}</pre>
                          <button onClick={() => edit(current.content)}>
                            使用磁盘内容
                          </button>
                        </details>
                      )}
                      {current.binary ? (
                        <div className="binary">
                          <p>
                            {current.mime || "二进制文件"} ·{" "}
                            {(current.size / 1024).toFixed(1)} KB
                          </p>
                          {current.mime.startsWith("image/") ? (
                            <img
                              src={`data:${current.mime};base64,${current.data}`}
                            />
                          ) : (
                            <p>
                              此文件通过系统应用查看。可使用文件菜单导入替换。
                            </p>
                          )}
                          <button
                            onClick={() =>
                              run("替换文件", async () => {
                                await Studio.import(
                                  project.id,
                                  "",
                                  current.path,
                                );
                                await read(current.path, true);
                              })
                            }
                          >
                            替换文件…
                          </button>
                        </div>
                      ) : form && isMarkdown ? (
                        <>
                          <div className="metadata">
                            <div className="language">
                              <button
                                className={language === "zh" ? "on" : ""}
                                onClick={() => setLanguage("zh")}
                              >
                                中文
                              </button>
                              <button
                                className={language === "en" ? "on" : ""}
                                onClick={() => setLanguage("en")}
                              >
                                English
                              </button>
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
                                  value={String(fm.doc.get(key) || "")}
                                  onChange={(e) =>
                                    metadata(key, e.target.value)
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <CodeMirror
                            value={
                              language === "en"
                                ? String(fm.doc.get("content_en") || "")
                                : fm.body
                            }
                            extensions={[markdown()]}
                            height="100%"
                            onChange={(v) =>
                              language === "en"
                                ? metadata("content_en", v)
                                : edit(
                                    "---\n" + fm.doc.toString() + "---\n" + v,
                                  )
                            }
                          />
                        </>
                      ) : (
                        <CodeMirror
                          value={current.text}
                          height="100%"
                          extensions={isMarkdown ? [markdown()] : syntax}
                          basicSetup={{ lineNumbers: true, foldGutter: true }}
                          onChange={edit}
                        />
                      )}
                    </div>
                    {showPreview && preview && (
                      <div className="preview">
                        <div className="preview-heading">
                          文章预览{" "}
                          <button onClick={() => setShowPreview(false)}>
                            关闭 ×
                          </button>
                        </div>
                        <iframe
                          title="文章预览"
                          src={preview}
                          sandbox="allow-scripts"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty">
                  <span>✎</span>
                  <h2>从左侧打开文件</h2>
                  <p>编辑内容会自动保留本地草稿，保存后进入 Git 改动列表。</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <footer>
        <span className="status-dot" />
        {busy || notice || "本地工作区已就绪"}
        <div className="spacer" />
        <span>
          {current
            ? `${current.size} bytes · UTF-8`
            : project?.root || "Cuttle"}
        </span>
      </footer>
      {error && (
        <div className="error" role="alert">
          <button onClick={() => setError("")}>×</button>
          <strong>操作未完成</strong>
          <pre>{error}</pre>
        </div>
      )}
      {modal && (
        <div className="overlay">
          <form
            className={"dialog " + (modal === "commit" ? "large" : "")}
            onSubmit={(e) => {
              e.preventDefault();
              run("处理中", submitModal);
            }}
          >
            <div className="dialog-title">
              <h2>
                {
                  (
                    {
                      open: "打开项目",
                      clone: "克隆 Git 项目",
                      create: "新建文件或目录",
                      article: "新建文章",
                      file: "文件操作",
                      branch: "切换分支",
                      newBranch: "新建分支",
                      remote: "远程仓库",
                      commit: "审阅并提交",
                    } as Record<string, string>
                  )[modal]
                }
              </h2>
              <button type="button" onClick={() => setModal("")}>
                ×
              </button>
            </div>
            {modal === "open" && field("path", "本地项目绝对路径")}
            {modal === "clone" && (
              <>
                {field("url", "仓库地址", "git@github.com:owner/repo.git")}
                {field("parent", "保存到父文件夹")}
                <button
                  type="button"
                  onClick={() =>
                    run("选择目录", async () => {
                      const p = await Studio.pickFolder();
                      if (p) setValues((v) => ({ ...v, parent: p }));
                    })
                  }
                >
                  选择文件夹…
                </button>
                {field("name", "新项目目录名", "my-project")}
              </>
            )}
            {modal === "create" && (
              <>
                {field("path", "相对于项目根目录的路径")}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={values.directory === "true"}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        directory: String(e.target.checked),
                      }))
                    }
                  />
                  创建文件夹
                </label>
              </>
            )}
            {modal === "article" && (
              <>
                {field("title", "文章标题")}
                {field("date", "发布日期", "", "date")}
                {field("slug", "文件名（英文 slug）", "new-post")}
                <p className="muted">
                  创建于 _posts，保存中英文元数据，提交前可继续编辑。
                </p>
              </>
            )}
            {modal === "file" && (
              <>
                <p>{values.path}</p>
                {field("to", "重命名 / 移动到")}
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      run("在 Finder 显示", () =>
                        Studio.reveal(project!.id, values.path),
                      )
                    }
                  >
                    在系统中显示
                  </button>
                  {values.directory !== "true" && (
                    <button
                      type="button"
                      onClick={() =>
                        run("替换文件", async () => {
                          await Studio.import(project!.id, "", values.path);
                          if (active === values.path) await read(active, true);
                          setModal("");
                          await refresh();
                        })
                      }
                    >
                      导入替换…
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      run("移到废纸篓", async () => {
                        await drafts();
                        await Studio.delete(project!.id, values.path);
                        setBuffers((bs) =>
                          bs.filter(
                            (b) =>
                              b.path !== values.path &&
                              !b.path.startsWith(values.path + "/"),
                          ),
                        );
                        setActive("");
                        setModal("");
                        await refresh();
                      })
                    }
                  >
                    移到废纸篓
                  </button>
                </div>
              </>
            )}
            {modal === "branch" && (
              <>
                <label>
                  分支
                  <select
                    value={values.branch}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, branch: e.target.value }))
                    }
                  >
                    <optgroup label="本地">
                      {status?.branches.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </optgroup>
                    <optgroup label="远程（自动创建跟踪分支）">
                      {status?.remoteBranches
                        .filter((b) => !b.endsWith("/HEAD"))
                        .map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                    </optgroup>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={stash}
                    onChange={(e) => setStash(e.target.checked)}
                  />
                  先保存编辑，并 stash 当前工作区改动后切换
                </label>
                <p className="muted">
                  有未提交改动时必须先提交或选择 stash。切换后不会自动恢复
                  stash。
                </p>
                <button type="button" onClick={() => dialog("newBranch")}>
                  ＋ 新建分支
                </button>
              </>
            )}
            {modal === "newBranch" &&
              field("name", "新分支名称", "codex/my-feature")}
            {modal === "remote" && (
              <>
                {status?.remotes.length ? (
                  <label>
                    已有远程
                    <select
                      value={values.name}
                      onChange={(e) => {
                        const r = status.remotes.find(
                          (r) => r.name === e.target.value,
                        );
                        if (r)
                          setValues({
                            name: r.name,
                            fetch: r.fetch,
                            push: r.push,
                          });
                      }}
                    >
                      {status.remotes.map((r) => (
                        <option key={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {field("name", "远程名称", "origin")}
                {field("fetch", "拉取地址")}
                {field("push", "推送地址（留空使用拉取地址）")}
                <p className="muted">
                  修改地址只更新当前项目的 Git
                  remote。克隆其他项目请使用顶部“克隆”。SSH 使用系统现有密钥。
                </p>
                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    run("删除远程配置", async () => {
                      setStatus(
                        await Studio.remote(
                          project!.id,
                          values.name,
                          "",
                          "",
                          true,
                        ),
                      );
                      setModal("");
                    })
                  }
                >
                  删除这个远程配置
                </button>
              </>
            )}
            {modal === "commit" && review && (
              <>
                <p>
                  分支 <b>{review.branch}</b> · {review.files.length} 个文件
                </p>
                <pre className="diff">
                  {review.diff || "无文本差异（二进制或权限变化）"}
                </pre>
                {field("message", "提交说明", "描述本次改动")}
                {field("remote", "推送目标 remote", "origin")}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={push}
                    onChange={(e) => setPush(e.target.checked)}
                  />
                  提交成功后推送当前分支
                </label>
              </>
            )}
            <div className="dialog-footer">
              <button type="button" onClick={() => setModal("")}>
                取消
              </button>
              <button
                className="primary"
                disabled={
                  !!busy || (modal === "commit" && !values.message?.trim())
                }
              >
                {busy ||
                  (
                    {
                      file: "确认移动",
                      commit: push ? "提交并推送" : "提交",
                      branch: "切换分支",
                    } as Record<string, string>
                  )[modal] ||
                  "确认"}
              </button>
            </div>
          </form>
        </div>
      )}
      {busy && (
        <div className="working" aria-live="polite">
          <span className="spinner" />
          {busy}…
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
