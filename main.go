package main

import (
	"context"
	"cuttle/internal/workspace"
	"embed"
	"errors"
	"github.com/egoist/mygo"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sync/atomic"
	"time"
)

//go:embed all:dist
var frontend embed.FS

var closing = mygo.NewEvent[bool]("studioClosing")
var quitAllowed atomic.Bool

type Studio struct {
	engine  *workspace.Engine
	preview *workspace.Previewer
}

func (s *Studio) CloseReady()                                        { quitAllowed.Store(true); mygo.App.Quit() }
func (s *Studio) Recent() []workspace.Project                        { return s.engine.Recent() }
func (s *Studio) OpenProject(root string) (workspace.Project, error) { return s.engine.Open(root) }
func (s *Studio) PickFolder(ctx context.Context) (string, error) {
	p, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "打开项目文件夹", Directory: true, CreateDirectories: true})
	if err != nil || len(p) == 0 {
		return "", err
	}
	return p[0], nil
}
func (s *Studio) Clone(ctx context.Context, url, parent, name string) (workspace.Project, error) {
	return s.engine.Clone(ctx, url, parent, name)
}
func (s *Studio) List(id, dir string, hidden bool) ([]workspace.Entry, error) {
	return s.engine.List(id, dir, hidden)
}
func (s *Studio) Read(id, path string) (workspace.File, error) { return s.engine.Read(id, path) }
func (s *Studio) Save(id, path, content, revision, branch string) (workspace.File, error) {
	return s.engine.Save(id, path, content, revision, branch)
}
func (s *Studio) SaveDraft(id, path, content, revision, branch string) error {
	return s.engine.SaveDraft(id, path, content, revision, branch)
}
func (s *Studio) Create(id, path string, directory bool) error {
	return s.engine.Create(id, path, directory)
}
func (s *Studio) Copy(id, from, to string) error { return s.engine.Copy(id, from, to) }
func (s *Studio) ImportImage(ctx context.Context, id, article string) (workspace.ImageAsset, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "选择图片（PNG / JPEG / GIF / WebP）"})
	if err != nil || len(paths) == 0 {
		return workspace.ImageAsset{}, err
	}
	return s.engine.ImportImage(id, article, paths[0])
}
func (s *Studio) Move(id, from, to string) error { return s.engine.Move(id, from, to) }
func (s *Studio) Delete(ctx context.Context, id, path string) error {
	result, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: mygo.CallerWindow(ctx), Type: mygo.MessageWarning, Message: "移到废纸篓？", Detail: path, Buttons: []string{"取消", "移到废纸篓"}, CancelButton: 0, DefaultButton: 0, DestructiveButtons: []int{1}})
	if err != nil || result.Button != 1 {
		return errors.New("已取消")
	}
	return s.engine.Delete(id, path)
}
func (s *Studio) Import(ctx context.Context, id, folder, target string) error {
	p, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "选择要导入或替换的文件"})
	if err != nil || len(p) == 0 {
		return err
	}
	if target != "" {
		return s.engine.Replace(id, target, p[0])
	}
	return s.engine.Import(id, folder, p[0], false)
}
func (s *Studio) OpenSystem(id, path string) error {
	full, err := s.engine.FullPath(id, path)
	if err != nil {
		return err
	}
	return mygo.Shell.OpenPath(full)
}
func (s *Studio) Reveal(id, path string) error {
	full, err := s.engine.FullPath(id, path)
	if err != nil {
		return err
	}
	mygo.Shell.ShowItemInFolder(full)
	return nil
}
func (s *Studio) Search(id, query string, contents bool) ([]workspace.Match, error) {
	return s.engine.Search(id, query, contents)
}
func (s *Studio) Status(ctx context.Context, id string) (workspace.Status, error) {
	return s.engine.GitStatus(ctx, id)
}
func (s *Studio) InitGit(ctx context.Context, id string) (workspace.Project, error) {
	return s.engine.Init(ctx, id)
}
func (s *Studio) Switch(ctx context.Context, id, branch string, stash bool) (workspace.Status, error) {
	return s.engine.Switch(ctx, id, branch, stash)
}
func (s *Studio) NewBranch(ctx context.Context, id, name string) (workspace.Status, error) {
	return s.engine.NewBranch(ctx, id, name)
}
func (s *Studio) Remote(ctx context.Context, id, name, fetch, push string, remove bool) (workspace.Status, error) {
	return s.engine.Remote(ctx, id, name, fetch, push, remove)
}
func (s *Studio) Network(ctx context.Context, id, action, remote string) (workspace.Status, error) {
	return s.engine.Network(ctx, id, action, remote)
}
func (s *Studio) Review(ctx context.Context, id string, paths []string) (workspace.Review, error) {
	return s.engine.Review(ctx, id, paths)
}
func (s *Studio) Commit(ctx context.Context, id, review, message string, push bool, remote string) (workspace.CommitResult, error) {
	return s.engine.Commit(ctx, id, review, message, push, remote)
}
func (s *Studio) Preview(ctx context.Context, id, path, content, kind string) (workspace.PreviewResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	p, err := s.engine.OpenProjectCopy(id)
	if err != nil {
		return workspace.PreviewResult{}, err
	}
	return s.preview.Render(ctx, p, path, content, kind)
}
func main() {
	dir := os.Getenv("CUTTLE_DATA")
	if dir == "" {
		dir = os.Getenv("GOCHIEF_DATA")
	}
	if dir == "" {
		dir = os.Getenv("GOCHIEF_STUDIO_DATA")
	}
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			log.Fatal(err)
		}
		dir = filepath.Join(base, "Cuttle")
		// Prefer Cuttle data; reuse a previous installation's records when absent.
		if _, statErr := os.Stat(dir); os.IsNotExist(statErr) {
			for _, name := range []string{"GochiefStudio", "Gochief"} {
				legacy := filepath.Join(base, name)
				if info, err := os.Stat(legacy); err == nil && info.IsDir() {
					dir = legacy
					break
				}
			}
		}
	}
	engine := workspace.New(dir)
	engine.Trash = mygo.Shell.TrashItem
	studio := &Studio{engine, workspace.NewPreviewer()}
	web, _ := fs.Sub(frontend, "dist")
	mygo.SetFrontend(web)
	mygo.Bind(studio)
	mygo.App.WhenReady(func() {
		win := mygo.NewWindow(mygo.WindowOptions{Title: "Cuttle", URL: "/", Width: 1320, Height: 840, MinWidth: 960, MinHeight: 640})
		win.OnClose(func(e *mygo.CloseEvent) {
			if !quitAllowed.Load() {
				e.PreventDefault()
				go closing.Emit(win, true)
			}
		})
		mygo.App.OnBeforeQuit(func(e *mygo.QuitEvent) {
			if !quitAllowed.Load() && !e.SessionEnding {
				e.PreventDefault()
				go closing.Emit(win, true)
			}
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
	studio.preview.Close()
}
