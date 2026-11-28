package workspace

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopyFilesAndDirectories(t *testing.T) {
	e, p := fixture(t)
	if err := e.Create(p.ID, "docs", true); err != nil {
		t.Fatal(err)
	}
	write(t, p, "docs/原文.md", "hello")
	if err := e.Copy(p.ID, "docs", "docs-copy"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(p.Root, "docs-copy/原文.md"))
	if err != nil || string(b) != "hello" {
		t.Fatal(string(b), err)
	}
	if err = e.Copy(p.ID, "docs/原文.md", "copied.md"); err != nil {
		t.Fatal(err)
	}
	if err = e.Copy(p.ID, "docs", "docs-copy"); err == nil {
		t.Fatal("overwrote existing destination")
	}
	if err = e.Copy(p.ID, "docs", "docs/child"); err == nil {
		t.Fatal("recursive copy accepted")
	}
	if err = e.Copy(p.ID, "docs", "../escape"); err == nil {
		t.Fatal("escaped project")
	}
	if err = os.Symlink(filepath.Join(p.Root, "docs"), filepath.Join(p.Root, "alias")); err != nil {
		t.Fatal(err)
	}
	if err = e.Copy(p.ID, "docs", "alias/child"); err == nil {
		t.Fatal("recursive copy through alias accepted")
	}
}
func TestCopyFailureIsAtomic(t *testing.T) {
	e, p := fixture(t)
	if err := e.Create(p.ID, "source", true); err != nil {
		t.Fatal(err)
	}
	write(t, p, "source/first", "safe")
	if err := os.Symlink(t.TempDir(), filepath.Join(p.Root, "source/link")); err != nil {
		t.Fatal(err)
	}
	if err := e.Copy(p.ID, "source", "output"); err == nil {
		t.Fatal("followed external symlink")
	}
	if _, err := os.Stat(filepath.Join(p.Root, "output")); !os.IsNotExist(err) {
		t.Fatal("partial copy visible")
	}
	if err := os.Remove(filepath.Join(p.Root, "source/link")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(p.Root, "source/.git"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := e.Copy(p.ID, "source", "output"); err == nil {
		t.Fatal("copied git metadata")
	}
	entries, _ := os.ReadDir(p.Root)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".cuttle-copy-") {
			t.Fatal("staging leaked")
		}
	}
}
func TestImportImageAndPreview(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "article.md", "# Article")
	var encoded bytes.Buffer
	picture := image.NewRGBA(image.Rect(0, 0, 2, 2))
	picture.Set(0, 0, color.RGBA{255, 0, 0, 255})
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "测试 图片.png")
	if err := os.WriteFile(source, encoded.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
	asset, err := e.ImportImage(p.ID, "article.md", source)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(asset.Markdown, "![测试 图片]") {
		t.Fatal(asset.Markdown)
	}
	stored, _ := os.ReadFile(filepath.Join(p.Root, asset.Path))
	if !bytes.Equal(stored, encoded.Bytes()) {
		t.Fatal("image changed")
	}
	next, err := e.ImportImage(p.ID, "article.md", source)
	if err != nil || next.Path == asset.Path {
		t.Fatal("duplicate names collide", err)
	}
	write(t, p, "not-image.txt", "not an image")
	if _, err = e.ImportImage(p.ID, "article.md", filepath.Join(p.Root, "not-image.txt")); err == nil {
		t.Fatal("accepted non-image")
	}
	write(t, p, "_config.yml", "title: test")
	p, err = e.Open(p.Root)
	if err != nil {
		t.Fatal(err)
	}
	jekyll, err := e.ImportImage(p.ID, "article.md", source)
	if err != nil || !strings.Contains(jekyll.Markdown, "relative_url") {
		t.Fatal(jekyll, err)
	}
	preview := NewPreviewer()
	defer preview.Close()
	result, err := preview.Render(ctx, p, "article.md", jekyll.Markdown, "markdown")
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.Get(result.URL)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	base := strings.TrimSuffix(result.URL, "index.html")
	if !strings.Contains(string(body), "src=\""+strings.TrimPrefix(base, "http://"+response.Request.URL.Host)+jekyll.Path) {
		t.Fatal(string(body))
	}
	img, err := http.Get(base + jekyll.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer img.Body.Close()
	if img.StatusCode != 200 {
		t.Fatal("image preview missing", img.StatusCode)
	}
}

func TestUntrackedFilesListedIndividually(t *testing.T) {
	e, p := fixture(t)
	if err := os.MkdirAll(filepath.Join(p.Root, "assets/images"), 0755); err != nil {
		t.Fatal(err)
	}
	write(t, p, "assets/images/one.png", "one")
	write(t, p, "assets/images/two.png", "two")
	s, err := e.GitStatus(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Changes) != 2 {
		t.Fatalf("untracked folder was collapsed: %+v", s.Changes)
	}
	commit(t, e, p, "assets/images/one.png")
	if got := command(t, p.Root, "ls-tree", "-r", "--name-only", "HEAD"); got != "assets/images/one.png" {
		t.Fatal(got)
	}
}
func TestJekyllImagePreviewIntegration(t *testing.T) {
	fixtureRoot := os.Getenv("STUDIO_JEKYLL_FIXTURE")
	if fixtureRoot == "" {
		t.Skip("set STUDIO_JEKYLL_FIXTURE")
	}
	root, _ := filepath.EvalSymlinks(t.TempDir())
	if err := copyTree(ctx, fixtureRoot, root); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "vendor"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(fixtureRoot, "vendor/bundle"), filepath.Join(root, "vendor/bundle")); err != nil {
		t.Fatal(err)
	}
	e := New(t.TempDir())
	p, err := e.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	rel := "_posts/2026-01-01-image-preview-test.md"
	write(t, p, rel, "---\nlayout: post\ntitle: image preview\n---\n")
	var encoded bytes.Buffer
	if err = png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "picture.png")
	if err = os.WriteFile(source, encoded.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
	asset, err := e.ImportImage(p.ID, rel, source)
	if err != nil {
		t.Fatal(err)
	}
	preview := NewPreviewer()
	defer preview.Close()
	result, err := preview.Render(ctx, p, rel, "---\nlayout: post\ntitle: image preview\n---\n"+asset.Markdown, "jekyll")
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.Get(result.URL)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	imageURL := strings.TrimSuffix(result.URL, "studio-article.html") + asset.Path
	if !strings.Contains(string(body), strings.TrimPrefix(imageURL, "http://"+response.Request.URL.Host)) {
		t.Fatal("image URL not rendered with preview baseurl")
	}
	response, err = http.Get(imageURL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || !bytes.Equal(data, encoded.Bytes()) {
		t.Fatal("image asset unavailable", response.StatusCode)
	}
}
