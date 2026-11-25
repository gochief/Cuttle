package workspace

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type Change struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath"`
	Status  string `json:"status"`
}
type Remote struct {
	Name  string `json:"name"`
	Fetch string `json:"fetch"`
	Push  string `json:"push"`
}
type Status struct {
	Branch         string   `json:"branch"`
	Head           string   `json:"head"`
	Upstream       string   `json:"upstream"`
	Ahead          int      `json:"ahead"`
	Behind         int      `json:"behind"`
	Changes        []Change `json:"changes"`
	Branches       []string `json:"branches"`
	RemoteBranches []string `json:"remoteBranches"`
	Remotes        []Remote `json:"remotes"`
	Stashes        []string `json:"stashes"`
	Log            string   `json:"log"`
}
type Review struct {
	ID     string   `json:"id"`
	Branch string   `json:"branch"`
	Files  []string `json:"files"`
	Diff   string   `json:"diff"`
}
type review struct {
	Review
	Project string
	Head    string
	Hashes  map[string]string
	Created time.Time
}
type CommitResult struct {
	Commit    string `json:"commit"`
	Pushed    bool   `json:"pushed"`
	PushError string `json:"pushError"`
}

func head(ctx context.Context, p Project) string {
	s, err := git(ctx, p.Root, nil, "rev-parse", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(s)
}
func status(ctx context.Context, p Project) (Status, error) {
	s := Status{Changes: []Change{}, Branches: []string{}, RemoteBranches: []string{}, Remotes: []Remote{}, Stashes: []string{}}
	if !p.Git {
		return s, nil
	}
	s.Head = head(ctx, p)
	s.Branch = strings.TrimSpace(mustGit(ctx, p, "symbolic-ref", "--short", "HEAD"))
	if s.Branch == "" {
		s.Branch = "HEAD (detached)"
	}
	raw, err := git(ctx, p.Root, nil, "status", "--porcelain=v1", "-z")
	if err != nil {
		return s, err
	}
	parts := strings.Split(raw, "\x00")
	for i := 0; i < len(parts); i++ {
		line := parts[i]
		if len(line) < 4 {
			continue
		}
		c := Change{Path: line[3:], Status: line[:2]}
		if strings.ContainsAny(c.Status, "RC") && i+1 < len(parts) {
			i++
			c.OldPath = parts[i]
		}
		s.Changes = append(s.Changes, c)
	}
	s.Upstream = strings.TrimSpace(mustGit(ctx, p, "rev-parse", "--abbrev-ref", "@{upstream}"))
	if s.Upstream != "" {
		counts := mustGit(ctx, p, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
		_, _ = fmt.Sscanf(counts, "%d %d", &s.Ahead, &s.Behind)
	}
	for _, b := range strings.Split(mustGit(ctx, p, "for-each-ref", "--format=%(refname:short)", "refs/heads"), "\n") {
		if b != "" {
			s.Branches = append(s.Branches, b)
		}
	}
	for _, b := range strings.Split(mustGit(ctx, p, "for-each-ref", "--format=%(refname:short)", "refs/remotes"), "\n") {
		if b != "" && !strings.HasSuffix(b, "/HEAD") {
			s.RemoteBranches = append(s.RemoteBranches, b)
		}
	}
	for _, name := range strings.Fields(mustGit(ctx, p, "remote")) {
		s.Remotes = append(s.Remotes, Remote{name, strings.TrimSpace(mustGit(ctx, p, "remote", "get-url", name)), strings.TrimSpace(mustGit(ctx, p, "remote", "get-url", "--push", name))})
	}
	for _, v := range strings.Split(strings.TrimSpace(mustGit(ctx, p, "stash", "list")), "\n") {
		if v != "" {
			s.Stashes = append(s.Stashes, v)
		}
	}
	s.Log = mustGit(ctx, p, "log", "-8", "--format=%h %s")
	return s, nil
}
func mustGit(ctx context.Context, p Project, args ...string) string {
	s, err := git(ctx, p.Root, nil, args...)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(s)
}
func (e *Engine) GitStatus(ctx context.Context, id string) (Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Status{}, err
	}
	return status(ctx, p)
}
func requireGit(p Project) error {
	if !p.Git {
		return errors.New("当前目录不是 Git 仓库根目录")
	}
	return nil
}
func validURL(u string) bool {
	if strings.ContainsAny(u, "\r\n\x00") || strings.HasPrefix(u, "-") {
		return false
	}
	return strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "ssh://") || strings.HasPrefix(u, "file://") || regexp.MustCompile("^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+:.+").MatchString(u) || filepath.IsAbs(u)
}
func (e *Engine) Clone(ctx context.Context, url, parent, name string) (Project, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !validURL(url) {
		return Project{}, errors.New("请输入 SSH、HTTPS 或本地仓库地址")
	}
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00") {
		return Project{}, errors.New("请输入有效的文件夹名称")
	}
	parent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return Project{}, err
	}
	target := filepath.Join(parent, name)
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return Project{}, errors.New("目标目录已存在，不会覆盖")
	}
	if _, err = git(ctx, parent, nil, "clone", "--", url, target); err != nil {
		return Project{}, err
	}
	return e.open(target)
}
func (e *Engine) Init(ctx context.Context, id string) (Project, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return p, err
	}
	if p.Git {
		return p, nil
	}
	if _, err = git(ctx, p.Root, nil, "init", "-b", "main"); err != nil {
		return p, err
	}
	return e.open(p.Root)
}
func (e *Engine) Switch(ctx context.Context, id, branch string, stash bool) (Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Status{}, err
	}
	if err = requireGit(p); err != nil {
		return Status{}, err
	}
	s, err := status(ctx, p)
	if err != nil {
		return s, err
	}

	validTarget := false
	for _, candidate := range append(append([]string{}, s.Branches...), s.RemoteBranches...) {
		if candidate == branch {
			validTarget = true
			break
		}
	}
	if !validTarget {
		return s, errors.New("请选择存在的分支")
	}
	if len(s.Changes) > 0 {
		if !stash {
			return s, errors.New("工作区有改动；请先提交，或选择保存并 stash 后切换")
		}
		if _, err = git(ctx, p.Root, nil, "stash", "push", "-u", "-m", "Cuttle before switching to "+branch); err != nil {
			return s, err
		}
	}
	exists := false
	for _, v := range s.Branches {
		if v == branch {
			exists = true
		}
	}
	if exists {
		_, err = git(ctx, p.Root, nil, "switch", "--", branch)
	} else {
		found := false
		for _, v := range s.RemoteBranches {
			if v == branch {
				found = true
			}
		}
		if !found {
			return s, errors.New("请选择存在的分支")
		}
		local := strings.Join(strings.Split(branch, "/")[1:], "/")
		_, err = git(ctx, p.Root, nil, "switch", "--track", "-c", local, "--", branch)
	}
	if err != nil {
		return s, err
	}
	return status(ctx, p)
}
func (e *Engine) NewBranch(ctx context.Context, id, name string) (Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Status{}, err
	}
	if err = requireGit(p); err != nil {
		return Status{}, err
	}
	if _, err = git(ctx, p.Root, nil, "check-ref-format", "--branch", name); err != nil {
		return Status{}, errors.New("分支名称不正确")
	}
	if _, err = git(ctx, p.Root, nil, "switch", "-c", name); err != nil {
		return Status{}, err
	}
	return status(ctx, p)
}
func (e *Engine) Remote(ctx context.Context, id, name, fetch, push string, remove bool) (Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Status{}, err
	}
	if err = requireGit(p); err != nil {
		return Status{}, err
	}
	if !regexp.MustCompile("^[A-Za-z0-9_][A-Za-z0-9_.-]*$").MatchString(name) {
		return Status{}, errors.New("远程名称只能包含字母、数字、短横线和下划线")
	}
	names := strings.Fields(mustGit(ctx, p, "remote"))
	exists := false
	for _, v := range names {
		if v == name {
			exists = true
		}
	}
	if remove {
		_, err = git(ctx, p.Root, nil, "remote", "remove", name)
	} else {
		if !validURL(fetch) || (push != "" && !validURL(push)) {
			return Status{}, errors.New("仓库地址格式不正确")
		}
		if exists {
			_, err = git(ctx, p.Root, nil, "remote", "set-url", name, fetch)
		} else {
			_, err = git(ctx, p.Root, nil, "remote", "add", name, fetch)
		}
		if err == nil {
			if push == "" {
				push = fetch
			}
			_, err = git(ctx, p.Root, nil, "remote", "set-url", "--push", name, push)
		}
	}
	if err != nil {
		return Status{}, err
	}
	return status(ctx, p)
}
func (e *Engine) Network(ctx context.Context, id, action, remote string) (Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Status{}, err
	}
	if err = requireGit(p); err != nil {
		return Status{}, err
	}
	if action == "stash-pop" {
		_, err = git(ctx, p.Root, nil, "stash", "pop")
	} else {
		s, _ := status(ctx, p)
		valid := false
		for _, r := range s.Remotes {
			if r.Name == remote {
				valid = true
			}
		}
		if !valid {
			return s, errors.New("请选择有效的远程仓库")
		}
		switch action {
		case "fetch":
			_, err = git(ctx, p.Root, nil, "fetch", remote)
		case "pull":
			_, err = git(ctx, p.Root, nil, "pull", "--ff-only", remote)
		case "push":
			if strings.HasPrefix(s.Branch, "HEAD") {
				return s, errors.New("游离 HEAD 不能推送，请先创建分支")
			}
			_, err = git(ctx, p.Root, nil, "push", "--set-upstream", remote, "HEAD:refs/heads/"+s.Branch)
		default:
			err = errors.New("未知 Git 操作")
		}
	}
	if err != nil {
		return Status{}, err
	}
	return status(ctx, p)
}
func fingerprint(p Project, rel string) string {
	b, err := os.ReadFile(filepath.Join(p.Root, filepath.FromSlash(rel)))
	if os.IsNotExist(err) {
		return "!deleted"
	}
	if err != nil {
		return "!error:" + err.Error()
	}
	return Sum(b)
}
func (e *Engine) Review(ctx context.Context, id string, paths []string) (Review, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return Review{}, err
	}
	if err = requireGit(p); err != nil {
		return Review{}, err
	}
	s, err := status(ctx, p)
	if err != nil {
		return Review{}, err
	}
	if strings.HasPrefix(s.Branch, "HEAD") {
		return Review{}, errors.New("请先创建或切换到一个分支")
	}
	if len(paths) == 0 {
		return Review{}, errors.New("请勾选要提交的文件")
	}
	selected := map[string]bool{}
	for _, rel := range paths {
		if _, err = safe(p, rel, false); err != nil {
			return Review{}, err
		}
		selected[rel] = true
	}
	files := []string{}
	for _, c := range s.Changes {
		if selected[c.Path] || selected[c.OldPath] {
			files = append(files, c.Path)
			if c.OldPath != "" {
				files = append(files, c.OldPath)
			}
		}
	}
	if len(files) == 0 {
		return Review{}, errors.New("选中的文件没有 Git 改动")
	}
	r := review{Review: Review{ID: Token(), Branch: s.Branch, Files: files}, Project: id, Head: s.Head, Hashes: map[string]string{}, Created: time.Now()}
	for _, rel := range files {
		r.Hashes[rel] = fingerprint(p, rel)
		var diff string
		if s.Head != "" {
			diff, _ = git(ctx, p.Root, nil, "diff", "HEAD", "--", rel)
		}
		if diff == "" && r.Hashes[rel] != "!deleted" {
			diff, _ = git(ctx, p.Root, nil, "diff", "--no-index", "--", "/dev/null", rel)
		}
		r.Diff += diff + "\n"
	}
	if len(r.Diff) > 2<<20 {
		return Review{}, errors.New("所选文件差异超过 2 MB，请分批提交")
	}
	e.reviews[r.ID] = r
	for k, v := range e.reviews {
		if time.Since(v.Created) > 20*time.Minute {
			delete(e.reviews, k)
		}
	}
	return r.Review, nil
}
func (e *Engine) Commit(ctx context.Context, id, reviewID, message string, push bool, remote string) (CommitResult, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	result := CommitResult{}
	p, err := e.Project(id)
	if err != nil {
		return result, err
	}
	r, ok := e.reviews[reviewID]
	if !ok || r.Project != id || time.Since(r.Created) > 20*time.Minute {
		return result, errors.New("提交确认已过期，请重新查看差异")
	}
	if message == "" || len(message) > 1000 || strings.ContainsAny(message, "\r\n\x00") {
		return result, errors.New("请输入单行提交说明")
	}
	s, err := status(ctx, p)
	if err != nil {
		return result, err
	}
	if s.Head != r.Head || s.Branch != r.Branch {
		return result, errors.New("分支或提交已变化，请重新确认差异")
	}
	for path, want := range r.Hashes {
		if fingerprint(p, path) != want {
			return result, errors.New("文件 " + path + " 已变化，请重新确认差异")
		}
	}
	if err = os.MkdirAll(e.Dir, 0700); err != nil {
		return result, err
	}
	temp, err := os.CreateTemp(e.Dir, "index-*")
	if err != nil {
		return result, err
	}
	index := temp.Name()
	_ = temp.Close()
	_ = os.Remove(index)
	defer os.Remove(index)
	env := []string{"GIT_INDEX_FILE=" + index}
	if s.Head == "" {
		_, err = git(ctx, p.Root, env, "read-tree", "--empty")
	} else {
		_, err = git(ctx, p.Root, env, "read-tree", "HEAD")
	}
	if err != nil {
		return result, err
	}
	args := append([]string{"add", "-A", "--"}, r.Files...)
	if _, err = git(ctx, p.Root, env, args...); err != nil {
		return result, err
	}
	if _, err = git(ctx, p.Root, env, "commit", "-m", message); err != nil {
		return result, err
	}
	result.Commit = head(ctx, p)
	delete(e.reviews, reviewID)
	if _, err = git(ctx, p.Root, nil, append([]string{"reset", "-q", "HEAD", "--"}, r.Files...)...); err != nil {
		result.PushError = "提交已创建，但同步暂存区失败：" + err.Error()
		return result, nil
	}
	if push {
		valid := false
		for _, v := range s.Remotes {
			if v.Name == remote {
				valid = true
			}
		}
		if !valid {
			result.PushError = "本地提交已保存，请先配置远程仓库"
			return result, nil
		}
		_, err = git(ctx, p.Root, nil, "push", "--set-upstream", remote, "HEAD:refs/heads/"+s.Branch)
		if err != nil {
			result.PushError = err.Error()
		} else {
			result.Pushed = true
		}
	}
	return result, nil
}
