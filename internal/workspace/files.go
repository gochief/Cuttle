package workspace

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Copy stages a complete copy before exposing the destination. Symlinks and
// nested Git metadata are rejected so copying never expands the project scope.
func (e *Engine) Copy(id, from, to string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return err
	}
	source, err := safe(p, from, false)
	if err != nil {
		return err
	}
	target, err := safe(p, to, false)
	if err != nil {
		return err
	}
	realSource, resolveErr := filepath.EvalSymlinks(source)
	if resolveErr != nil {
		return resolveErr
	}
	realParent, resolveErr := filepath.EvalSymlinks(filepath.Dir(target))
	if resolveErr != nil {
		return resolveErr
	}
	if inside(realSource, filepath.Join(realParent, filepath.Base(target))) {
		return errors.New("不能复制到自身或自己的子目录")
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return errors.New("目标路径已存在")
	}
	staging, err := os.MkdirTemp(filepath.Dir(target), ".cuttle-copy-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	payload := filepath.Join(staging, "item")
	if err = copyEntry(source, payload); err != nil {
		return err
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return errors.New("目标路径已存在")
	}
	return os.Rename(payload, target)
}
func copyEntry(source, target string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return errors.New("复制内容包含符号链接，请单独处理链接文件")
	}
	if strings.EqualFold(info.Name(), ".git") {
		return errors.New("不能复制 Git 内部文件或包含嵌套仓库的目录")
	}
	if info.Mode().IsRegular() {
		return copyFile(source, target)
	}
	if !info.IsDir() {
		return errors.New("只能复制普通文件与目录")
	}
	if err = os.Mkdir(target, 0700); err != nil {
		return err
	}
	children, err := os.ReadDir(source)
	if err != nil {
		return err
	}
	for _, child := range children {
		if err = copyEntry(filepath.Join(source, child.Name()), filepath.Join(target, child.Name())); err != nil {
			return err
		}
	}
	return os.Chmod(target, info.Mode().Perm())
}

type ImageAsset struct {
	Path     string `json:"path"`
	Markdown string `json:"markdown"`
}

func (e *Engine) ImportImage(id, article, source string) (ImageAsset, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	p, err := e.Project(id)
	if err != nil {
		return ImageAsset{}, err
	}
	if _, err = safe(p, article, false); err != nil {
		return ImageAsset{}, err
	}
	ext := strings.ToLower(filepath.Ext(article))
	if ext != ".md" && ext != ".markdown" {
		return ImageAsset{}, errors.New("请在 Markdown 文章中插入图片")
	}
	f, err := os.Open(source)
	if err != nil {
		return ImageAsset{}, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return ImageAsset{}, errors.New("请选择普通图片文件")
	}
	if info.Size() > 20<<20 {
		return ImageAsset{}, errors.New("图片超过 20 MB，请压缩后导入")
	}
	header := make([]byte, 512)
	n, _ := f.Read(header)
	suffix := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}[http.DetectContentType(header[:n])]
	if suffix == "" {
		return ImageAsset{}, errors.New("支持 PNG、JPEG、GIF 和 WebP 图片，请选择有效的图片文件")
	}
	// Walk each newly created ancestor through safe(), including an existing assets symlink.
	folder, err := safe(p, "assets/images", false)
	if err != nil {
		return ImageAsset{}, err
	}
	if err = os.MkdirAll(folder, 0755); err != nil {
		return ImageAsset{}, err
	}
	rel := "assets/images/" + Token() + suffix
	target, err := safe(p, rel, false)
	if err != nil {
		return ImageAsset{}, err
	}
	// Copy from the validated bytes to avoid changing type/size between validation and import.
	if _, err = f.Seek(0, 0); err != nil {
		return ImageAsset{}, err
	}
	data := make([]byte, info.Size())
	if _, err = io.ReadFull(f, data); err != nil {
		return ImageAsset{}, err
	}
	if http.DetectContentType(data) != http.DetectContentType(header[:n]) {
		return ImageAsset{}, errors.New("图片在导入过程中发生变化，请重试")
	}
	if err = atomic(target, data, 0644); err != nil {
		return ImageAsset{}, err
	}
	alt := strings.TrimSuffix(filepath.Base(source), filepath.Ext(source))
	alt = strings.NewReplacer("[", "\\[", "]", "\\]", "\n", " ", "\r", " ").Replace(alt)
	link := "/" + url.PathEscape("assets") + "/images/" + filepath.Base(rel)
	if p.Jekyll {
		link = "{{ '" + link + "' | relative_url }}"
	}
	return ImageAsset{Path: rel, Markdown: fmt.Sprintf("![%s](%s)", alt, link)}, nil
}
