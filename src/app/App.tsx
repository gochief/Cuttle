import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  Studio,
  type Project,
  type Entry,
  type Status,
  type Review,
  type Match,
} from "../mygo";
import { on } from "mygo-runtime";
import { ProjectHeader } from "../components/ProjectHeader";
import { WelcomeScreen } from "../components/WelcomeScreen";
import { FileTree } from "../components/FileTree";
import { WorkspaceDialogs } from "../components/WorkspaceDialogs";
import { Icon, type IconName } from "../components/Icon";
import { parseFrontmatter } from "../lib/frontmatter";
import type { FileBuffer as Buffer } from "./types";
const FileEditor = lazy(() => import("../components/FileEditor"));
export default function App() {
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
  const [preview, setPreview] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState(false);
  const [language, setLanguage] = useState("zh");
  const current = buffers.find((b) => b.path === active);
  const refs = useRef({ project, buffers, busy });
  refs.current = { project, buffers, busy };
  const dirty = (b: Buffer) => b.text !== b.content;
  async function run<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
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
  async function refresh(p = project, reveal = "") {
    if (!p) return;
    setStatus(await Studio.status(p.id));
    const dirs = new Set(p.id === project?.id ? expanded : []);
    const parts = reveal.split("/");
    for (let i = 1; i < parts.length; i++)
      dirs.add(parts.slice(0, i).join("/"));
    const next: Record<string, Entry[]> = {
      "": await Studio.list(p.id, "", hidden),
    };
    const opened: string[] = [];
    for (const dir of dirs) {
      try {
        next[dir] = await Studio.list(p.id, dir, hidden);
        opened.push(dir);
      } catch {}
    }
    setTree(next);
    setExpanded(opened);
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
    let cancelled = false;
    const t = setInterval(
      () =>
        Studio.status(project.id)
          .then((next) => {
            if (!cancelled) setStatus(next);
          })
          .catch(() => {}),
      5000,
    );
    return () => {
      cancelled = true;
      clearInterval(t);
    };
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
  async function openEntry(entry: Entry) {
    if (!project) return;
    if (!entry.directory) {
      await read(entry.path);
      return;
    }
    setFolder(entry.path);
    if (expanded.includes(entry.path)) {
      setExpanded((items) => items.filter((path) => path !== entry.path));
      return;
    }
    const rows = await Studio.list(project.id, entry.path, hidden);
    setTree((items) => ({ ...items, [entry.path]: rows }));
    setExpanded((items) => [...items, entry.path]);
  }
  async function moveFile(from: string, to: string) {
    if (!project) return;
    if (from === to) {
      setNotice("位置未变化");
      return;
    }
    const affected = buffers.filter(
      (file) => file.path === from || file.path.startsWith(from + "/"),
    );
    await saveAll();
    await Studio.move(project.id, from, to);
    const mapPath = (path: string) =>
      path === from || path.startsWith(from + "/")
        ? to + path.slice(from.length)
        : path;
    const moved = await Promise.all(
      affected.map((file) => Studio.read(project.id, mapPath(file.path))),
    );
    setBuffers((items) =>
      items.map((file) => {
        const next = moved.find((item) => item.path === mapPath(file.path));
        return next ? { ...next, text: next.content } : file;
      }),
    );
    setActive(mapPath);
    setFolder(mapPath);
    setSelected([]);
    setPreview("");
    await refresh(project, to);
    setNotice("已移动到 " + to);
  }
  const isMarkdown = current && /\.(md|markdown)$/i.test(current.path);
  function frontmatter() {
    return parseFrontmatter(current?.text || "");
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
      await refresh(p, path);
      if (values.directory !== "true") await read(path);
      else setFolder(path);
    }
    if (modal === "file") {
      if (values.action === "copy") {
        await saveAll();
        await Studio.copy(p.id, values.path, values.to);
        await refresh(p, values.to);
        setNotice("已复制到 " + values.to);
      } else await moveFile(values.path, values.to);
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
      <ProjectHeader
        project={project}
        recent={recent}
        status={status}
        onOpenProject={(root) => run("切换项目", () => openProject(root))}
        onOpenFolder={() =>
          run("打开文件夹", async () => {
            const path = await Studio.pickFolder();
            if (path) await openProject(path);
          })
        }
        onClone={() => dialog("clone")}
        onBranch={() => dialog("branch", { branch: status?.branch || "" })}
        onRemote={() =>
          dialog("remote", {
            name: status?.remotes[0]?.name || "origin",
            fetch: status?.remotes[0]?.fetch || "",
            push: status?.remotes[0]?.push || "",
          })
        }
      />
      {!project ? (
        <WelcomeScreen
          recent={recent}
          onOpenFolder={() =>
            run("打开项目", async () => {
              const path = await Studio.pickFolder();
              if (path) await openProject(path);
            })
          }
          onOpenPath={() => dialog("open")}
          onClone={() => dialog("clone")}
          onOpenProject={(root) => run("打开项目", () => openProject(root))}
        />
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
                ["files", "folder", "文件"],
                ["search", "search", "搜索"],
                ["git", "branch", "Git"],
              ].map(([id, icon, label]) => (
                <button
                  className={view === id ? "chosen" : ""}
                  key={id}
                  title={label}
                  aria-label={label}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  <Icon name={icon as IconName} />
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
                  <FileTree
                    tree={tree}
                    expanded={expanded}
                    active={active}
                    onMove={(from, dir) =>
                      run("移动文件", () =>
                        moveFile(
                          from,
                          (dir ? dir + "/" : "") + from.split("/").pop(),
                        ),
                      )
                    }
                    onOpen={(entry) => run("打开文件", () => openEntry(entry))}
                    onMenu={(entry) =>
                      dialog("file", {
                        path: entry.path,
                        directory: String(entry.directory),
                        to: entry.path,
                        action: "move",
                      })
                    }
                  />
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
                    <Suspense
                      fallback={
                        <div className="editor-loading">
                          <span className="spinner" />
                          正在载入编辑器…
                        </div>
                      }
                    >
                      <FileEditor
                        file={current}
                        form={form}
                        language={language}
                        onImportImage={() =>
                          run("导入并插入图片", async () => {
                            const asset = await Studio.importImage(
                              project.id,
                              current.path,
                            );
                            if (asset.path) {
                              await refresh(project, asset.path);
                              setNotice("图片已导入，保存文章后可一并提交");
                            }
                            return asset;
                          })
                        }
                        onLanguage={setLanguage}
                        onEdit={edit}
                        onError={setError}
                        onReplace={() =>
                          run("替换文件", async () => {
                            await Studio.import(project.id, "", current.path);
                            await read(current.path, true);
                          })
                        }
                      />
                    </Suspense>
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
                  <span className="empty-icon">
                    <Icon name="pen" />
                  </span>
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
        <WorkspaceDialogs
          modal={modal}
          values={values}
          setValues={setValues}
          status={status}
          review={review}
          push={push}
          setPush={setPush}
          stash={stash}
          setStash={setStash}
          busy={busy}
          onCreateChild={(directory) => {
            const base =
              values.directory === "true"
                ? values.path
                : values.path.split("/").slice(0, -1).join("/");
            dialog("create", {
              path: base ? base + "/" : "",
              directory: String(directory),
            });
          }}
          onClose={() => setModal("")}
          onSubmit={() => run("处理中", submitModal)}
          onDialog={dialog}
          onPickFolder={() =>
            run("选择目录", async () => {
              const path = await Studio.pickFolder();
              if (path) setValues((value) => ({ ...value, parent: path }));
            })
          }
          onReveal={() =>
            run("在系统中显示", () => Studio.reveal(project!.id, values.path))
          }
          onReplaceFile={() =>
            run("替换文件", async () => {
              await Studio.import(project!.id, "", values.path);
              if (active === values.path) await read(active, true);
              setModal("");
              await refresh();
            })
          }
          onTrashFile={() =>
            run("移到废纸篓", async () => {
              await drafts();
              await Studio.delete(project!.id, values.path);
              setBuffers((items) =>
                items.filter(
                  (file) =>
                    file.path !== values.path &&
                    !file.path.startsWith(values.path + "/"),
                ),
              );
              const removed = (path: string) =>
                path === values.path || path.startsWith(values.path + "/");
              setActive((path) => (removed(path) ? "" : path));
              setFolder((path) => (removed(path) ? "" : path));
              setSelected((paths) => paths.filter((path) => !removed(path)));
              setPreview("");
              setModal("");
              await refresh();
            })
          }
          onRemoveRemote={() =>
            run("删除远程配置", async () => {
              setStatus(
                await Studio.remote(project!.id, values.name, "", "", true),
              );
              setModal("");
            })
          }
        />
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
