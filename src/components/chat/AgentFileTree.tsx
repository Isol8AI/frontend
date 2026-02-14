"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentFile } from "@/hooks/useAgentSettings";

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  file?: AgentFile;
}

interface AgentFileTreeProps {
  files: AgentFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

function buildTree(files: AgentFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path: fullPath,
          isDirectory: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelectFile,
  expandedPaths,
  toggleExpand,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = node.path === selectedPath;
  const isDirty =
    node.file && node.file.content !== node.file.originalContent;

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-1 w-full text-left px-2 py-1 text-sm rounded transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isDirectory) {
            toggleExpand(node.path);
          } else {
            onSelectFile(node.path);
          }
        }}
      >
        {node.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" />
            )}
            <Folder className="w-4 h-4 shrink-0 opacity-50" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File className="w-4 h-4 shrink-0 opacity-50" />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {isDirty && (
          <span className="ml-auto text-amber-400 text-xs shrink-0">*</span>
        )}
      </button>
      {node.isDirectory && isExpanded && (
        <div>
          {sortNodes(node.children).map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentFileTree({
  files,
  selectedPath,
  onSelectFile,
}: AgentFileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const paths = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        paths.add(parts.slice(0, i).join("/"));
      }
    }
    return paths;
  });

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="overflow-y-auto">
      {sortNodes(tree).map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          expandedPaths={expandedPaths}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
}
