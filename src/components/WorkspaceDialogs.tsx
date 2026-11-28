import type { Dispatch, SetStateAction } from "react";
import type { Status, Review } from "../mygo";
import { Dialog } from "./Dialog";
type Props = {
  modal: string;
  values: Record<string, string>;
  setValues: Dispatch<SetStateAction<Record<string, string>>>;
  status?: Status;
  review?: Review;
  push: boolean;
  setPush: (value: boolean) => void;
  stash: boolean;
  setStash: (value: boolean) => void;
  busy: string;
  onCreateChild: (directory: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDialog: (kind: string) => void;
  onPickFolder: () => void;
  onReveal: () => void;
  onReplaceFile: () => void;
  onTrashFile: () => void;
  onRemoveRemote: () => void;
};
export function WorkspaceDialogs({
  modal,
  values,
  setValues,
  status,
  review,
  push,
  setPush,
  stash,
  setStash,
  busy,
  onCreateChild,
  onClose,
  onSubmit,
  onDialog,
  onPickFolder,
  onReveal,
  onReplaceFile,
  onTrashFile,
  onRemoveRemote,
}: Props) {
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
  return (
    <Dialog
      title={
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
      wide={modal === "commit"}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {modal === "open" && field("path", "本地项目绝对路径")}
      {modal === "clone" && (
        <>
          {field("url", "仓库地址", "git@github.com:owner/repo.git")}
          {field("parent", "保存到父文件夹")}
          <button type="button" onClick={onPickFolder}>
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
          <div className="file-operation-switch">
            <button
              type="button"
              className={values.action !== "copy" ? "on" : ""}
              onClick={() =>
                setValues((v) => ({ ...v, action: "move", to: v.path }))
              }
            >
              移动 / 重命名
            </button>
            <button
              type="button"
              className={values.action === "copy" ? "on" : ""}
              onClick={() =>
                setValues((v) => {
                  const at = v.path.lastIndexOf(".");
                  const isFile =
                    v.directory !== "true" && at > v.path.lastIndexOf("/");
                  return {
                    ...v,
                    action: "copy",
                    to: isFile
                      ? v.path.slice(0, at) + "-copy" + v.path.slice(at)
                      : v.path + "-copy",
                  };
                })
              }
            >
              复制
            </button>
          </div>
          {field(
            "to",
            values.action === "copy"
              ? "复制到（项目内完整路径）"
              : "移动到（项目内完整路径）",
          )}
          <p className="muted">
            目标文件或目录已存在时不会覆盖。复制目录包含全部子文件。
          </p>
          <div className="actions">
            <button type="button" onClick={() => onCreateChild(false)}>
              ＋ 新建文件
            </button>
            <button type="button" onClick={() => onCreateChild(true)}>
              ＋ 新建目录
            </button>
          </div>
          <div className="actions">
            <button type="button" onClick={onReveal}>
              在系统中显示
            </button>
            {values.directory !== "true" && (
              <button type="button" onClick={onReplaceFile}>
                导入替换…
              </button>
            )}
            <button type="button" className="danger" onClick={onTrashFile}>
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
            有未提交改动时必须先提交或选择 stash。切换后不会自动恢复 stash。
          </p>
          <button type="button" onClick={() => onDialog("newBranch")}>
            ＋ 新建分支
          </button>
        </>
      )}
      {modal === "newBranch" && field("name", "新分支名称", "codex/my-feature")}
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
          <button type="button" className="danger" onClick={onRemoveRemote}>
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
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={!!busy || (modal === "commit" && !values.message?.trim())}
        >
          {busy ||
            (
              {
                file: values.action === "copy" ? "确认复制" : "确认移动",
                commit: push ? "提交并推送" : "提交",
                branch: "切换分支",
              } as Record<string, string>
            )[modal] ||
            "确认"}
        </button>
      </div>
    </Dialog>
  );
}
