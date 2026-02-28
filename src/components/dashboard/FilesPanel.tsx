"use client";

import { useState } from "react";
import { Loader2, Upload, Trash2, FileText, FolderOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFiles } from "@/hooks/useFiles";

export function FilesPanel() {
  const { files, isLoading, error, uploadFile, deleteFile, downloadFile } = useFiles();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadPath, setUploadPath] = useState("");
  const [uploadContent, setUploadContent] = useState("");

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load files.</div>;

  const handleUpload = async () => {
    if (!uploadPath.trim()) return;
    await uploadFile(uploadPath, uploadContent);
    setUploadPath("");
    setUploadContent("");
    setShowUpload(false);
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium flex items-center gap-1"><FolderOpen className="h-4 w-4" />Workspace Files</h2>
        <Button size="sm" variant="outline" onClick={() => setShowUpload(!showUpload)}><Upload className="h-4 w-4 mr-1" />Upload</Button>
      </div>
      {showUpload && (
        <div className="p-3 rounded-md border border-border space-y-2">
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={uploadPath} onChange={(e) => setUploadPath(e.target.value)} placeholder="File path (e.g. agents/my-bot/SOUL.md)" />
          <textarea className="w-full h-32 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none" value={uploadContent} onChange={(e) => setUploadContent(e.target.value)} placeholder="File contents..." />
          <Button size="sm" onClick={handleUpload}>Upload</Button>
        </div>
      )}
      {(!files || files.length === 0) ? (
        <p className="text-sm text-muted-foreground">No files in workspace.</p>
      ) : (
        <div className="space-y-1">
          {files.map((f) => (
            <div key={f.path} className="flex items-center justify-between p-2 rounded-md border border-border">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono">{f.path}</span>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => downloadFile(f.path)}><Download className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteFile(f.path)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
