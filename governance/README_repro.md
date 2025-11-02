===== FILE: README_repro.md =====
# README_repro — Note Compacter Repro Instructions

===== APPENDIX — 2025-10-31 — Stage 2 Run & Verify (Windows) =====
1) From C:\var\www\note-compacter run: `npm run dev`.
2) In the window: click "New Project", enter a name in the modal, confirm it appears in the Projects list.
3) Click "Ingest Files", select .txt files, verify master editor populates with appended sections.
4) Type a line into the editor, click "Save Master", close the app, run `npm run dev` again, confirm persistence.
5) Click "Export Master", choose a destination, verify the .txt exists and matches the editor content.
6) Click "Delete Project", confirm removal from UI; verify original source files were untouched.
