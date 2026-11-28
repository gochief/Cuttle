import type { Project, Status } from "../mygo";
import { Icon } from "./Icon";
type Props = {
  project?: Project;
  recent: Project[];
  status?: Status;
  onOpenProject: (root: string) => void;
  onOpenFolder: () => void;
  onClone: () => void;
  onBranch: () => void;
  onRemote: () => void;
};
export function ProjectHeader({
  project,
  recent,
  status,
  onOpenProject,
  onOpenFolder,
  onClone,
  onBranch,
  onRemote,
}: Props) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="logo">C</span>
        <div>
          Cuttle<small>LOCAL WORKSPACE</small>
        </div>
      </div>
      <div className="project-picker">
        <Icon name="folder" />
        <select
          aria-label="切换项目"
          value={project?.root || ""}
          onChange={(e) => e.target.value && onOpenProject(e.target.value)}
        >
          <option value="">选择工作区</option>
          {recent.map((p) => (
            <option key={p.id} value={p.root}>
              {p.name} · {p.root}
            </option>
          ))}
        </select>
      </div>
      <button onClick={onOpenFolder}>
        <Icon name="folder" />
        打开文件夹
      </button>
      <button onClick={onClone}>
        <Icon name="clone" />
        克隆
      </button>
      <div className="spacer" />
      {project?.git && (
        <>
          <button className="branch-button" onClick={onBranch}>
            <Icon name="branch" />
            {status?.branch || "分支"}
          </button>
          <button onClick={onRemote}>
            <Icon name="globe" />
            远程仓库
          </button>
        </>
      )}
      <span className="local-badge">
        <i />
        本地运行
      </span>
    </header>
  );
}
