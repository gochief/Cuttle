import type { Project } from "../mygo";
import { Icon } from "./Icon";
type Props = {
  recent: Project[];
  onOpenFolder: () => void;
  onOpenPath: () => void;
  onClone: () => void;
  onOpenProject: (root: string) => void;
};
export function WelcomeScreen({
  recent,
  onOpenFolder,
  onOpenPath,
  onClone,
  onOpenProject,
}: Props) {
  return (
    <main className="welcome">
      <div className="welcome-intro">
        <p className="eyebrow">
          <span /> YOUR LOCAL WORKSPACE
        </p>
        <h1>想法，从这里落笔。</h1>
        <p className="welcome-description">
          把文件、写作与 Git 放在一起。
          <br />
          打开你的项目，专注于下一次创作。
        </p>
        <div className="welcome-actions">
          <button className="primary" onClick={onOpenFolder}>
            <Icon name="folder" />
            打开项目文件夹
            <Icon name="arrow" />
          </button>
          <button onClick={onClone}>
            <Icon name="clone" />
            克隆 Git 仓库
          </button>
          <button className="text-button" onClick={onOpenPath}>
            输入本地路径
          </button>
        </div>
      </div>
      <section className="recent-section" aria-label="最近项目">
        <div className="section-heading">
          <h2>
            <Icon name="clock" />
            最近项目
          </h2>
          <span>
            {recent.length ? `${recent.length} 个工作区` : "准备好开始了吗"}
          </span>
        </div>
        {recent.length ? (
          <div className="recent">
            {recent.map((p) => (
              <button key={p.id} onClick={() => onOpenProject(p.root)}>
                <span className="project-icon">
                  <Icon name="folder" />
                </span>
                <span className="recent-info">
                  <b>{p.name}</b>
                  <small title={p.root}>{p.root}</small>
                </span>
                <span className="project-kind">
                  {p.jekyll ? "Jekyll" : p.git ? "Git" : "本地"}
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <Icon name="folder" />
            <div>
              <b>你的项目会显示在这里</b>
              <p>打开本地文件夹，或克隆一个 Git 仓库。</p>
            </div>
          </div>
        )}
      </section>
      <div className="welcome-notes">
        <span>
          <Icon name="file" />
          多文件编辑
        </span>
        <span>
          <Icon name="pen" />
          双语博客写作
        </span>
        <span>
          <Icon name="branch" />
          Git 版本管理
        </span>
      </div>
    </main>
  );
}
