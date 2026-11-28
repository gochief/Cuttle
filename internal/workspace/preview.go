package workspace

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"html"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type PreviewResult struct {
	URL  string `json:"url"`
	Kind string `json:"kind"`
}
type previewSite struct {
	AssetRoot string
	Temp      string
	Dir       string
	Created   time.Time
}
type Previewer struct {
	mu     sync.Mutex
	root   string
	prefix string
	sites  map[string]previewSite
	server *http.Server
}

func NewPreviewer() *Previewer { return &Previewer{prefix: Token(), sites: map[string]previewSite{}} }
func (p *Previewer) start() error {
	if p.server != nil {
		return nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	p.root = "http://" + ln.Addr().String() + "/" + p.prefix
	p.server = &http.Server{Handler: http.HandlerFunc(p.serve), ReadHeaderTimeout: 5 * time.Second}
	go p.server.Serve(ln)
	return nil
}
func (p *Previewer) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.server != nil {
		_ = p.server.Close()
	}
	for _, s := range p.sites {
		_ = os.RemoveAll(s.Temp)
	}
}
func (p *Previewer) serve(w http.ResponseWriter, r *http.Request) {
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 3)
	if len(parts) != 3 || parts[0] != p.prefix {
		http.NotFound(w, r)
		return
	}
	p.mu.Lock()
	site, ok := p.sites[parts[1]]
	p.mu.Unlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(site.Dir, filepath.FromSlash(parts[2]))
	if !inside(site.Dir, full) {
		http.NotFound(w, r)
		return
	}
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil || !inside(site.Dir, resolved) {
		if site.AssetRoot == "" {
			http.NotFound(w, r)
			return
		}
		resolved, err = safe(Project{Root: site.AssetRoot}, parts[2], false)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		info, statErr := os.Stat(resolved)
		if statErr != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox allow-scripts; default-src 'none'; script-src http://"+r.Host+"; style-src 'unsafe-inline' http://"+r.Host+" https:; img-src http://"+r.Host+" https: data:; font-src https: data:; connect-src 'none'; frame-src https:; base-uri 'none'; form-action 'none'")
	if strings.HasSuffix(resolved, ".html") {
		b, err := os.ReadFile(resolved)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(b)
		return
	}
	http.ServeFile(w, r, resolved)
}
func (p *Previewer) Render(ctx context.Context, project Project, rel, content, kind string) (PreviewResult, error) {
	if _, err := safe(project, rel, false); err != nil {
		return PreviewResult{}, err
	}
	if len(content) > 4<<20 {
		return PreviewResult{}, errors.New("预览内容超过 4 MB")
	}
	p.mu.Lock()
	err := p.start()
	base := p.root
	p.mu.Unlock()
	if err != nil {
		return PreviewResult{}, err
	}
	id := Token()
	temp, err := os.MkdirTemp("", "cuttle-preview-")
	if err != nil {
		return PreviewResult{}, err
	}
	temp, err = filepath.EvalSymlinks(temp)
	if err != nil {
		return PreviewResult{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(temp)
		}
	}()
	output := temp
	urlPath := "/index.html"
	if kind == "jekyll" {
		if !project.Jekyll {
			return PreviewResult{}, errors.New("这个项目未检测到 _config.yml")
		}
		source := filepath.Join(temp, "source")
		output = filepath.Join(temp, "site")
		if err = copyTree(ctx, project.Root, source); err != nil {
			return PreviewResult{}, err
		}
		target := filepath.Join(source, filepath.FromSlash(rel))
		if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return PreviewResult{}, err
		}
		if err = os.WriteFile(target, []byte(content), 0644); err != nil {
			return PreviewResult{}, err
		}
		// The temporary build publishes only the chosen file at a stable preview URL.
		original, err := os.ReadFile(target)
		if err != nil {
			return PreviewResult{}, err
		}
		text := string(original)
		if strings.HasPrefix(text, "---\n") {
			if at := strings.Index(text[4:], "\n---"); at >= 0 {
				at += 4
				text = text[:at] + "\npermalink: /studio-article.html\npublished: true\ncomments: false\n" + text[at:]
			}
		}
		if err = os.WriteFile(target, []byte(text), 0644); err != nil {
			return PreviewResult{}, err
		}
		overlay := filepath.Join(temp, "preview.yml")
		_ = os.WriteFile(overlay, []byte("google_analytics: false\n"), 0600)
		rubyPath := "/opt/homebrew/opt/ruby@3.3/bin"
		if _, err = os.Stat(rubyPath); err != nil {
			rubyPath = "/usr/local/opt/ruby@3.3/bin"
		}
		cmd := exec.CommandContext(ctx, "/usr/bin/env", "bundle", "exec", "jekyll", "build", "--source", source, "--destination", output, "--config", filepath.Join(source, "_config.yml")+","+overlay, "--baseurl", "/"+p.prefix+"/"+id, "--future", "--disable-disk-cache")
		cmd.Dir = project.Root
		cmd.Env = append(os.Environ(), "PATH="+rubyPath+":/opt/homebrew/bin:/usr/local/bin:"+os.Getenv("PATH"), "BUNDLE_GEMFILE="+filepath.Join(project.Root, "Gemfile"))
		// Finder-launched apps may have an ASCII locale. Ruby must decode both
		// file contents and directory entries as UTF-8, including Chinese names.
		// Keep existing Ruby options; only override encoding for this child.
		cmd.Env = append(cmd.Env, "RUBYOPT="+strings.TrimSpace(os.Getenv("RUBYOPT")+" -EUTF-8:UTF-8"))
		if _, statErr := os.Stat(filepath.Join(project.Root, "vendor", "bundle")); statErr == nil {
			cmd.Env = append(cmd.Env, "BUNDLE_PATH="+filepath.Join(project.Root, "vendor", "bundle"))
		}
		b, err := cmd.CombinedOutput()
		if err != nil {
			return PreviewResult{}, fmt.Errorf("Jekyll 预览失败，请检查 Ruby / Bundler 和项目依赖：\n%s", string(b))
		}
		urlPath = "/studio-article.html"
		if _, err = os.Stat(filepath.Join(output, "studio-article.html")); err != nil {
			return PreviewResult{}, errors.New("文章需要有效的 Jekyll YAML 头信息，或改用 Markdown 预览")
		}
	} else {
		var rendered bytes.Buffer
		md := goldmark.New(goldmark.WithExtensions(extension.GFM))
		body := content
		if strings.HasPrefix(body, "---\n") {
			if at := strings.Index(body[4:], "\n---"); at >= 0 {
				body = body[at+8:]
			}
		}
		// Resolve the Jekyll asset syntax emitted by the image importer in fast previews too.
		body = regexp.MustCompile(`\{\{\s*'(/[^']+)'\s*\|\s*relative_url\s*\}\}`).ReplaceAllString(body, "$1")
		if err = md.Convert([]byte(body), &rendered); err != nil {
			return PreviewResult{}, err
		}
		page := "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + html.EscapeString(filepath.Base(rel)) + "</title><style>body{margin:0;background:#fafbf8;color:#29362d;font:16px/1.9 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}article{max-width:850px;margin:auto;padding:38px}h1,h2,h3{line-height:1.4;margin:1.5em 0 .7em}h1{font-size:30px}pre{padding:18px;background:#edf1e8;border-radius:7px;overflow:auto}code{font-family:ui-monospace,monospace;font-size:.88em}blockquote{border-left:3px solid #a8b99c;padding-left:18px;color:#78856d;margin-left:0}a{color:#416c45}img{max-width:100%}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #d7dfd0;padding:8px 12px}hr{border:0;border-top:1px solid #d7dfd0}ul,ol{padding-left:25px}</style></head><body><article>" + strings.ReplaceAll(rendered.String(), `src="/`, `src="/`+p.prefix+`/`+id+`/`) + "</article></body></html>"
		if err = os.WriteFile(filepath.Join(temp, "index.html"), []byte(page), 0600); err != nil {
			return PreviewResult{}, err
		}
	}
	p.mu.Lock()
	assets := ""
	if kind != "jekyll" {
		assets = project.Root
	}
	p.sites[id] = previewSite{AssetRoot: assets, Temp: temp, Dir: output, Created: time.Now()}
	for key, s := range p.sites {
		if time.Since(s.Created) > time.Hour {
			delete(p.sites, key)
			_ = os.RemoveAll(s.Temp)
		}
	}
	p.mu.Unlock()
	success = true
	return PreviewResult{base + "/" + id + urlPath, kind}, nil
}
func copyTree(ctx context.Context, source, dest string) error {
	return filepath.WalkDir(source, func(name string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err = ctx.Err(); err != nil {
			return err
		}
		rel, _ := filepath.Rel(source, name)
		if rel == "." {
			return os.MkdirAll(dest, 0755)
		}
		if strings.HasPrefix(d.Name(), ".") || ignored[d.Name()] || (d.IsDir() && strings.HasPrefix(d.Name(), "_site")) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Size() > 64<<20 {
			return nil
		}
		return copyFile(name, target)
	})
}
