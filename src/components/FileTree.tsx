import { Fragment, useState } from "react";
import type { Entry } from "../mygo";
import { Icon } from "./Icon";
type Props = {
  tree: Record<string, Entry[]>;
  expanded: string[];
  active: string;
  onOpen: (entry: Entry) => void;
  onMenu: (entry: Entry) => void;
  onMove: (from: string, directory: string) => void;
};
export function FileTree({
  tree,
  expanded,
  active,
  onOpen,
  onMenu,
  onMove,
}: Props) {
  const [dragged, setDragged] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  function drop(event: React.DragEvent, dir: string) {
    event.preventDefault();
    event.stopPropagation();
    const source = event.dataTransfer.getData("application/x-cuttle-path");
    setDragged("");
    setTarget(null);
    if (source) onMove(source, dir);
  }
  function rows(dir: string, depth = 0): React.ReactNode {
    return (tree[dir] || []).map((entry) => (
      <Fragment key={entry.path}>
        <div
          draggable={!entry.link}
          onContextMenu={(event) => {
            event.preventDefault();
            onMenu(entry);
          }}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData("application/x-cuttle-path", entry.path);
            event.dataTransfer.effectAllowed = "move";
            setDragged(entry.path);
          }}
          onDragEnd={() => {
            setDragged("");
            setTarget(null);
          }}
          onDragOver={(event) => {
            if (
              entry.directory &&
              dragged &&
              entry.path !== dragged &&
              !entry.path.startsWith(dragged + "/")
            ) {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setTarget(entry.path);
            }
          }}
          onDrop={(event) => {
            if (entry.directory) drop(event, entry.path);
          }}
          className={
            "file-row " +
            (active === entry.path ? "active " : "") +
            (target === entry.path ? "drop-target " : "") +
            (dragged === entry.path ? "dragging" : "")
          }
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
      <div
        className={"tree-root-drop " + (target === "" ? "drop-target" : "")}
        onDragOver={(event) => {
          if (dragged) {
            event.preventDefault();
            setTarget("");
          }
        }}
        onDrop={(event) => drop(event, "")}
      >
        ⌂ 项目根目录{" "}
        <small>
          {dragged
            ? "拖放到此处移动到根目录"
            : "右键或 ⋯ 管理文件，拖动到目录移动"}
        </small>
      </div>
      {rows("")}
    </div>
  );
}
