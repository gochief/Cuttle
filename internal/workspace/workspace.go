package workspace

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type Project struct {
	ID     string `json:"id"`
	Root   string `json:"root"`
	Name   string `json:"name"`
	Git    bool   `json:"git"`
	Jekyll bool   `json:"jekyll"`
}
type Entry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Directory bool   `json:"directory"`
	Link      bool   `json:"link"`
	Size      int64  `json:"size"`
}
type File struct {
	Branch        string `json:"branch"`
	Path          string `json:"path"`
	Content       string `json:"content"`
	Revision      string `json:"revision"`
	Binary        bool   `json:"binary"`
	MIME          string `json:"mime"`
	Data          string `json:"data"`
	Size          int64  `json:"size"`
	HasDraft      bool   `json:"hasDraft"`
	Draft         string `json:"draft"`
	DraftConflict bool   `json:"draftConflict"`
}
type Draft struct {
	Path    string    `json:"path"`
	Content string    `json:"content"`
	Base    string    `json:"base"`
	Updated time.Time `json:"updated"`
}
type Match struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Text string `json:"text"`
}
type Engine struct {
	mu       sync.Mutex
	Dir      string
	projects map[string]Project
	recent   []Project
	reviews  map[string]review
	Trash    func(string) error
}

func New(dir string) *Engine {
	e := &Engine{Dir: dir, projects: map[string]Project{}, reviews: map[string]review{}}
	b, _ := os.ReadFile(filepath.Join(dir, "projects.json"))
	_ = json.Unmarshal(b, &e.recent)
	for _, p := range e.recent {
		e.projects[p.ID] = p
	}
	return e
}
func Sum(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
func Token() string       { b := make([]byte, 18); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func (e *Engine) Project(id string) (Project, error) {
	p, ok := e.projects[id]
	if !ok {
		return p, errors.New("请先打开项目")
	}
	return p, nil
}
func (e *Engine) OpenProjectCopy(id string) (Project, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.Project(id)
}
func atomic(name string, data []byte, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(name), ".cuttle-save-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if err = f.Chmod(mode); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	ce := f.Close()
	if err != nil {
		return err
	}
	if ce != nil {
		return ce
	}
	return os.Rename(tmp, name)
}
func (e *Engine) persist() error {
	if err := os.MkdirAll(e.Dir, 0700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(e.recent, "", "  ")
	return atomic(filepath.Join(e.Dir, "projects.json"), b, 0600)
}
func (e *Engine) Recent() []Project {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]Project{}, e.recent...)
}
func (e *Engine) Open(root string) (Project, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.open(root)
}
func (e *Engine) open(root string) (Project, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return Project{}, err
	}
	abs, err = filepath.EvalSymlinks(abs)
	if err != nil {
		return Project{}, err
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		return Project{}, errors.New("请选择存在的项目文件夹")
	}
	p := Project{ID: Sum([]byte(abs))[:20], Root: abs, Name: filepath.Base(abs)}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	top, err := git(ctx, abs, nil, "rev-parse", "--show-toplevel")
	if err == nil {
		canonical, _ := filepath.EvalSymlinks(strings.TrimSpace(top))
		p.Git = canonical == abs
	}
	_, err = os.Stat(filepath.Join(abs, "_config.yml"))
	p.Jekyll = err == nil
	e.projects[p.ID] = p
	next := []Project{p}
	for _, old := range e.recent {
		if old.ID != p.ID {
			next = append(next, old)
		}
	}
	if len(next) > 20 {
		next = next[:20]
	}
	e.recent = next
	return p, e.persist()
}
func inside(root, name string) bool {
	rel, err := filepath.Rel(root, name)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
func protected(rel string) bool {
	for _, part := range strings.Split(filepath.ToSlash(rel), "/") {
		if strings.EqualFold(part, ".git") {
			return true
		}
	}
	return false
}
func safe(p Project, rel string, allowRoot bool) (string, error) {
	if strings.ContainsRune(rel, 0) || filepath.IsAbs(rel) || protected(rel) {
		return "", errors.New("不能访问项目外的路径或 Git 内部文件")
	}
	rel = filepath.Clean(filepath.FromSlash(rel))
	full := filepath.Join(p.Root, rel)
	if !inside(p.Root, full) || (!allowRoot && full == p.Root) {
		return "", errors.New("操作必须位于项目目录内")
	}
	probe := full
	for {
		resolved, err := filepath.EvalSymlinks(probe)
		if err == nil {
			r, _ := filepath.Rel(p.Root, resolved)
			if !inside(p.Root, resolved) || protected(r) {
				return "", errors.New("符号链接指向项目外或 Git 内部目录")
			}
			break
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		parent := filepath.Dir(probe)
		if parent == probe {
			return "", err
		}
		probe = parent
	}
	return full, nil
}

var ignored = map[string]bool{"node_modules": true, "vendor": true, "dist": true, "build": true, "_site": true, "_site-preview": true}

func (e *Engine) List(id, dir string, hidden bool) ([]Entry, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return nil, err
	}
	full, err := safe(p, dir, true)
	if err != nil {
		return nil, err
	}
	items, err := os.ReadDir(full)
	if err != nil {
		return nil, err
	}
	out := []Entry{}
	for _, item := range items {
		if item.Name() == ".git" || (!hidden && (strings.HasPrefix(item.Name(), ".") || ignored[item.Name()])) {
			continue
		}
		info, err := item.Info()
		if err != nil {
			continue
		}
		out = append(out, Entry{item.Name(), filepath.ToSlash(filepath.Join(dir, item.Name())), item.IsDir(), item.Type()&os.ModeSymlink != 0, info.Size()})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Directory != out[j].Directory {
			return out[i].Directory
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}
func (e *Engine) branch(p Project) string {
	if !p.Git {
		return ""
	}
	b, err := git(context.Background(), p.Root, nil, "symbolic-ref", "--short", "HEAD")
	if err != nil {
		return "HEAD:" + head(context.Background(), p)
	}
	return strings.TrimSpace(b)
}
func (e *Engine) draftPath(p Project, branch, path string) string {
	return filepath.Join(e.Dir, "drafts", p.ID, Sum([]byte(branch+"\x00"+path))+".json")
}
func (e *Engine) Read(id, rel string) (File, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return File{}, err
	}
	full, err := safe(p, rel, false)
	if err != nil {
		return File{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return File{}, err
	}
	if !info.Mode().IsRegular() {
		return File{}, errors.New("不是普通文件")
	}
	if info.Size() > 32<<20 {
		return File{}, errors.New("文件大于 32 MB，请使用系统应用打开或替换")
	}
	b, err := os.ReadFile(full)
	if err != nil {
		return File{}, err
	}
	f := File{Branch: e.branch(p), Path: rel, Revision: Sum(b), Size: info.Size(), MIME: mime.TypeByExtension(strings.ToLower(filepath.Ext(rel)))}
	f.Binary = !utf8.Valid(b) || strings.ContainsRune(string(b), 0)
	if f.Binary {
		f.Data = base64.StdEncoding.EncodeToString(b)
		return f, nil
	}
	f.Content = string(b)
	data, _ := os.ReadFile(e.draftPath(p, e.branch(p), rel))
	var d Draft
	if json.Unmarshal(data, &d) == nil && d.Content != f.Content {
		f.HasDraft = true
		f.Draft = d.Content
		f.DraftConflict = d.Base != f.Revision
	}
	return f, nil
}
func (e *Engine) Save(id, rel, content, revision, branch string) (File, error) {
	e.mu.Lock()
	p, err := e.Project(id)
	if err != nil {
		e.mu.Unlock()
		return File{}, err
	}
	if e.branch(p) != branch {
		e.mu.Unlock()
		return File{}, errors.New("分支已变化，请重新打开文件")
	}
	full, err := safe(p, rel, false)
	if err != nil {
		e.mu.Unlock()
		return File{}, err
	}
	b, err := os.ReadFile(full)
	if err != nil {
		e.mu.Unlock()
		return File{}, err
	}
	if Sum(b) != revision {
		e.mu.Unlock()
		return File{}, errors.New("文件已被外部程序修改，请重新载入并比较后保存")
	}
	info, _ := os.Stat(full)
	err = atomic(full, []byte(content), info.Mode().Perm())
	if err == nil {
		_ = os.Remove(e.draftPath(p, e.branch(p), rel))
	}
	e.mu.Unlock()
	if err != nil {
		return File{}, err
	}
	return e.Read(id, rel)
}
func (e *Engine) SaveDraft(id, rel, content, revision, branch string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	if _, err = safe(p, rel, false); err != nil {
		return err
	}
	name := e.draftPath(p, branch, rel)
	if err = os.MkdirAll(filepath.Dir(name), 0700); err != nil {
		return err
	}
	b, _ := json.Marshal(Draft{rel, content, revision, time.Now()})
	return atomic(name, b, 0600)
}
func (e *Engine) Create(id, rel string, directory bool) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	full, err := safe(p, rel, false)
	if err != nil {
		return err
	}
	if directory {
		return os.Mkdir(full, 0755)
	}
	f, err := os.OpenFile(full, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	return f.Close()
}
func (e *Engine) Move(id, from, to string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	a, err := safe(p, from, false)
	if err != nil {
		return err
	}
	b, err := safe(p, to, false)
	if err != nil {
		return err
	}
	if _, err = os.Lstat(b); !os.IsNotExist(err) {
		return errors.New("目标路径已存在")
	}
	return os.Rename(a, b)
}
func (e *Engine) Delete(id, rel string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	full, err := safe(p, rel, false)
	if err != nil {
		return err
	}
	if e.Trash == nil {
		return errors.New("系统废纸篓不可用，文件未删除")
	}
	return e.Trash(full)
}
func (e *Engine) Import(id, folder, source string, replace bool) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	target, err := safe(p, filepath.Join(folder, filepath.Base(source)), false)
	if err != nil {
		return err
	}
	if !replace {
		if _, err = os.Lstat(target); !os.IsNotExist(err) {
			return errors.New("同名文件已存在；请选择替换操作")
		}
	}
	return copyFile(source, target)
}
func copyFile(source, target string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	info, err := input.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("只能导入普通文件")
	}
	temp, err := os.CreateTemp(filepath.Dir(target), ".cuttle-import-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	_, err = io.Copy(temp, input)
	if err == nil {
		err = temp.Sync()
	}
	ce := temp.Close()
	if err != nil {
		return err
	}
	if ce != nil {
		return ce
	}
	mode := info.Mode().Perm()
	if existing, statErr := os.Stat(target); statErr == nil {
		mode = existing.Mode().Perm()
	}
	if err = os.Chmod(temp.Name(), mode); err != nil {
		return err
	}
	return os.Rename(temp.Name(), target)
}
func (e *Engine) Replace(id, rel, source string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	target, err := safe(p, rel, false)
	if err != nil {
		return err
	}
	if _, err = os.Stat(target); err != nil {
		return err
	}
	return copyFile(source, target)
}
func (e *Engine) Search(id, query string, contents bool) ([]Match, error) {
	e.mu.Lock()
	p, err := e.Project(id)
	e.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if query == "" {
		return []Match{}, nil
	}
	out := []Match{}
	needle := strings.ToLower(query)
	err = filepath.WalkDir(p.Root, func(name string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(p.Root, name)
		if rel == "." {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") || ignored[d.Name()] || d.Type()&os.ModeSymlink != 0 {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if len(out) >= 300 {
			return filepath.SkipAll
		}
		if d.IsDir() {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if strings.Contains(strings.ToLower(rel), needle) {
			out = append(out, Match{Path: rel})
		}
		if !contents {

			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > 2<<20 {
			return nil
		}
		b, err := os.ReadFile(name)
		if err != nil || !utf8.Valid(b) || strings.ContainsRune(string(b), 0) {
			return nil
		}
		for i, line := range strings.Split(string(b), "\n") {
			if strings.Contains(strings.ToLower(line), needle) {
				r := []rune(line)
				if len(r) > 300 {
					line = string(r[:300]) + "…"
				}
				out = append(out, Match{rel, i + 1, strings.TrimSpace(line)})
				if len(out) >= 300 {
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	return out, err
}
func (e *Engine) FullPath(id, rel string) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return "", err
	}
	return safe(p, rel, false)
}
func git(ctx context.Context, root string, env []string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes -o ConnectTimeout=15")
	cmd.Env = append(cmd.Env, env...)
	b, err := cmd.CombinedOutput()
	if err != nil {
		return string(b), fmt.Errorf("%s", strings.TrimSpace(string(b))+" "+err.Error())
	}
	return string(b), nil
}
