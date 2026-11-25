package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var ctx = context.Background()

func command(t *testing.T, root string, args ...string) string {
	t.Helper()
	s, err := git(ctx, root, nil, args...)
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(s)
}
func fixture(t *testing.T) (*Engine, Project) {
	t.Helper()
	root := t.TempDir()
	command(t, root, "init", "-b", "main")
	command(t, root, "config", "user.name", "Studio Test")
	command(t, root, "config", "user.email", "studio@example.invalid")
	e := New(t.TempDir())
	p, err := e.Open(root)
	if err != nil {
		t.Fatal(err)
	}
	return e, p
}
func write(t *testing.T, p Project, path, text string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(p.Root, path), []byte(text), 0644); err != nil {
		t.Fatal(err)
	}
}
func commit(t *testing.T, e *Engine, p Project, paths ...string) CommitResult {
	t.Helper()
	r, err := e.Review(ctx, p.ID, paths)
	if err != nil {
		t.Fatal(err)
	}
	c, err := e.Commit(ctx, p.ID, r.ID, "test commit", false, "")
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func TestSelectedCommitPreservesStaging(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a.txt", "initial")
	write(t, p, "b.txt", "initial")
	commit(t, e, p, "a.txt", "b.txt")
	write(t, p, "a.txt", "a changed")
	write(t, p, "b.txt", "staged b")
	command(t, p.Root, "add", "b.txt")
	commit(t, e, p, "a.txt")
	if got := command(t, p.Root, "show", "HEAD:b.txt"); got != "initial" {
		t.Fatalf("unselected change committed: %s", got)
	}
	if got := command(t, p.Root, "show", ":b.txt"); got != "staged b" {
		t.Fatalf("staging lost: %s", got)
	}
	if got := command(t, p.Root, "diff", "--cached", "--name-only"); got != "b.txt" {
		t.Fatal(got)
	}
}
func TestReviewRejectsChangedFile(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a", "first")
	r, err := e.Review(ctx, p.ID, []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	write(t, p, "a", "second")
	if _, err = e.Commit(ctx, p.ID, r.ID, "stale", false, ""); err == nil {
		t.Fatal("accepted stale review")
	}
}
func TestFilesystemAndDraftGuards(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a", "initial")
	f, err := e.Read(p.ID, "a")
	if err != nil {
		t.Fatal(err)
	}
	if err = e.SaveDraft(p.ID, "a", "", f.Revision, f.Branch); err != nil {
		t.Fatal(err)
	}
	f, _ = e.Read(p.ID, "a")
	if !f.HasDraft || f.Draft != "" {
		t.Fatal("empty draft not recoverable")
	}
	write(t, p, "a", "external")
	if _, err = e.Save(p.ID, "a", "overwrite", f.Revision, f.Branch); err == nil {
		t.Fatal("overwrote external change")
	}
	for _, path := range []string{"../outside", ".git/config", "x/../../outside"} {
		if err = e.Create(p.ID, path, false); err == nil {
			t.Fatal("accepted", path)
		}
	}
	outside := t.TempDir()
	if err = os.Symlink(outside, filepath.Join(p.Root, "escape")); err != nil {
		t.Fatal(err)
	}
	if err = e.Create(p.ID, "escape/file", false); err == nil {
		t.Fatal("accepted escaping link")
	}
	if err = e.Create(p.ID, "new", true); err != nil {
		t.Fatal(err)
	}
	if err = e.Move(p.ID, "a", "new/moved"); err != nil {
		t.Fatal(err)
	}
}
func TestBranchStashAndDraftIsolation(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a", "initial")
	commit(t, e, p, "a")
	command(t, p.Root, "branch", "other")
	f, _ := e.Read(p.ID, "a")
	if err := e.SaveDraft(p.ID, "a", "draft", f.Revision, f.Branch); err != nil {
		t.Fatal(err)
	}
	write(t, p, "a", "work")
	if _, err := e.Switch(ctx, p.ID, "other", false); err == nil {
		t.Fatal("switched dirty tree")
	}
	s, err := e.Switch(ctx, p.ID, "other", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Stashes) != 1 {
		t.Fatal("missing stash")
	}
	other, _ := e.Read(p.ID, "a")
	if other.HasDraft {
		t.Fatal("draft crossed branches")
	}
	if _, err = e.Save(p.ID, "a", "wrong branch", other.Revision, f.Branch); err == nil {
		t.Fatal("saved into wrong branch")
	}
	if _, err = e.Switch(ctx, p.ID, "main", false); err != nil {
		t.Fatal(err)
	}
	f, _ = e.Read(p.ID, "a")
	if f.Draft != "draft" {
		t.Fatal("draft lost")
	}
}
func TestCloneRemotePushAndDelete(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a", "initial")
	commit(t, e, p, "a")
	bare := filepath.Join(t.TempDir(), "remote.git")
	command(t, p.Root, "init", "--bare", bare)
	if _, err := e.Remote(ctx, p.ID, "origin", bare, "", false); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Network(ctx, p.ID, "push", "origin"); err != nil {
		t.Fatal(err)
	}
	clone, err := e.Clone(ctx, bare, t.TempDir(), "copy")
	if err != nil {
		t.Fatal(err)
	}
	if !clone.Git {
		t.Fatal("clone not detected")
	}
	write(t, p, "a", "second")
	commit(t, e, p, "a")
	if _, err = e.Network(ctx, p.ID, "push", "origin"); err != nil {
		t.Fatal(err)
	}
	if err = os.Remove(filepath.Join(p.Root, "a")); err != nil {
		t.Fatal(err)
	}
	commit(t, e, p, "a")
	if got := command(t, p.Root, "ls-tree", "--name-only", "HEAD"); got != "" {
		t.Fatal("delete not committed", got)
	}
}

func TestHookFailureAndRemoteBranch(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "a", "base")
	commit(t, e, p, "a")
	hook := filepath.Join(p.Root, ".git", "hooks", "pre-commit")
	if err := os.WriteFile(hook, []byte("#!/bin/sh\nexit 1\n"), 0755); err != nil {
		t.Fatal(err)
	}
	oldHead := head(ctx, p)
	write(t, p, "a", "changed")
	r, err := e.Review(ctx, p.ID, []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.Commit(ctx, p.ID, r.ID, "hook rejected", false, ""); err == nil {
		t.Fatal("hook ignored")
	}
	if head(ctx, p) != oldHead {
		t.Fatal("failed commit changed HEAD")
	}
	if err = os.Remove(hook); err != nil {
		t.Fatal(err)
	}
	commit(t, e, p, "a")
	bare := filepath.Join(t.TempDir(), "remote.git")
	command(t, p.Root, "init", "--bare", bare)
	command(t, p.Root, "remote", "add", "origin", bare)
	command(t, p.Root, "push", "origin", "HEAD:refs/heads/feature")
	command(t, p.Root, "fetch", "origin")
	s, err := e.Switch(ctx, p.ID, "origin/feature", false)
	if err != nil {
		t.Fatal(err)
	}
	if s.Branch != "feature" || s.Upstream != "origin/feature" {
		t.Fatalf("unexpected tracking branch: %+v", s)
	}
}
func TestBinaryAndTrash(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "data.bin", "\x00\xff\x01")
	f, err := e.Read(p.ID, "data.bin")
	if err != nil || !f.Binary || f.Data != "AP8B" {
		t.Fatalf("binary read: %+v %v", f, err)
	}
	dest := filepath.Join(t.TempDir(), "recovered.bin")
	e.Trash = func(path string) error { return os.Rename(path, dest) }
	if err = e.Delete(p.ID, "data.bin"); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(dest); err != nil || string(b) != "\x00\xff\x01" {
		t.Fatal("recoverable delete failed")
	}
}

func TestRenameWithSpaces(t *testing.T) {
	e, p := fixture(t)
	write(t, p, "原 文件.md", "base")
	commit(t, e, p, "原 文件.md")
	command(t, p.Root, "mv", "原 文件.md", "新 文件.md")
	commit(t, e, p, "新 文件.md")
	if got := command(t, p.Root, "ls-tree", "--name-only", "HEAD"); !strings.Contains(got, ".md") {
		t.Fatal(got)
	}
	s, err := e.GitStatus(ctx, p.ID)
	if err != nil || len(s.Changes) != 0 {
		t.Fatalf("rename left changes: %+v %v", s, err)
	}
}
