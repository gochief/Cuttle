package workspace

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMarkdownPreviewIsolation(t *testing.T) {
	p := NewPreviewer()
	defer p.Close()
	root, _ := filepath.EvalSymlinks(t.TempDir())
	r, err := p.Render(context.Background(), Project{Root: root}, "article.md", "---\ntitle: test\n---\n# Hello\n<script>alert(1)</script>", "markdown")
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.Get(r.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(b), "<h1>Hello</h1>") || strings.Contains(string(b), "<script>alert") {
		t.Fatal(string(b))
	}
	if !strings.Contains(res.Header.Get("Content-Security-Policy"), "sandbox") {
		t.Fatal("missing sandbox")
	}
	bad, _ := http.Get(strings.Replace(r.URL, p.prefix, "wrong", 1))
	defer bad.Body.Close()
	if bad.StatusCode != 404 {
		t.Fatal(bad.StatusCode)
	}
}
func TestJekyllPreviewIntegration(t *testing.T) {
	// Finder-launched apps may inherit no UTF-8 locale, unlike terminal sessions.
	t.Setenv("LANG", "C")
	t.Setenv("LC_ALL", "C")
	t.Setenv("LC_CTYPE", "C")
	root := os.Getenv("STUDIO_JEKYLL_FIXTURE")
	if root == "" {
		t.Skip("set STUDIO_JEKYLL_FIXTURE to verify installed Jekyll")
	}
	entries, err := os.ReadDir(filepath.Join(root, "_posts"))
	if err != nil {
		t.Fatal(err)
	}
	var rel string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".md") {
			rel = "_posts/" + e.Name()
			break
		}
	}
	if rel == "" {
		t.Fatal("no post")
	}
	b, err := os.ReadFile(filepath.Join(root, rel))
	if err != nil {
		t.Fatal(err)
	}
	p := NewPreviewer()
	defer p.Close()
	r, err := p.Render(context.Background(), Project{Root: root, Jekyll: true}, rel, string(b), "jekyll")
	if err != nil {
		t.Fatal(err)
	}
	res, err := http.Get(r.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.Contains(string(body), "<html") {
		t.Fatalf("bad rendered article: %d", res.StatusCode)
	}
}
