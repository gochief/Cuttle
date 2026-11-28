import { Fragment } from "react";
import type { Entry } from "../mygo";
import { Icon } from "./Icon";
type Props = {
  tree: Record<string, Entry[]>;
  expanded: string[];
  active: string;
  onOpen: (entry: Entry) => void;
  onMenu: (entry: Entry) => void;
};
export function FileTree({ tree, expanded, active, onOpen, onMenu }: Props) {
  function rows(dir: string, depth = 0): React.ReactNode {
    return (tree[dir] || []).map((entry) => (
      <Fragment key={entry.path}>
        <div
          className={"file-row " + (active === entry.path ? "active" : "")}
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <button
            className="file-open"
            title={entry.path}
            aria-expanded={
              entry.directory ? expanded.includes(entry.path) : undefined
            }
            onClick={() => onOpen(entry)}
          >
            {entry.directory ? (
              <>
                <Icon
                  name="chevron"
                  className={
                    "disclosure " +
                    (expanded.includes(entry.path) ? "expanded" : "")
                  }
                />
                <Icon name="folder" />
              </>
            ) : (
              <>
                <span className="disclosure-spacer" />
                <Icon name="file" />
              </>
            )}
            <span className="filename">
              {entry.name}
              {entry.link ? " ↗" : ""}
            </span>
          </button>
          <button
            className="row-action"
            aria-label={`操作 ${entry.name}`}
            title="文件操作"
            onClick={() => onMenu(entry)}
          >
            <Icon name="more" />
          </button>
        </div>
        {entry.directory &&
          expanded.includes(entry.path) &&
          rows(entry.path, depth + 1)}
      </Fragment>
    ));
  }
  return (
    <div className="tree" aria-label="项目文件">
      {rows("")}
    </div>
  );
}
