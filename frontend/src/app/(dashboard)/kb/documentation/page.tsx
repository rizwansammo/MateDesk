'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Folder, FileText, ChevronRight, ChevronDown, Plus, Trash2, Edit2, Copy, Move, X } from 'lucide-react';
import { useKBFolders, useUpdateKBFolder, useKBArticles, useCreateKBFolder, useCreateKBArticle, useDeleteKBFolder, useDeleteKBArticle, useUpdateKBArticle } from '@/hooks/useKB';

function buildTree(folders: any[], allArticles: any[], parentId: string | null = null): any[] {
  return folders
    .filter(f => f.parent_id === parentId)
    .map(f => ({ 
      ...f, 
      children: buildTree(folders, allArticles, f.id),
      articleCount: allArticles.filter(a => a.folder_id === f.id).length
    }));
}

function TreeItem({ node, currentFolderId, setCurrentFolderId, level = 0 }: any) {
  const [expanded, setExpanded] = useState(false);
  const isSelected = currentFolderId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div 
        className="flex items-center py-1.5 px-2 cursor-pointer hover:bg-[var(--bg-surface)] text-[13px] text-[var(--text-1)]"
        style={{ paddingLeft: level * 16 + 24, background: isSelected ? 'rgba(37,99,235,0.1)' : '', color: isSelected ? '#60a5fa' : '' }}
        onClick={() => { setCurrentFolderId(node.id); setExpanded(true); }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            // This is a minimal hook up for D&D in the sidebar if needed, handled globally above in the ExplorerTree as well.
          } catch(err) {}
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center mr-1" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <div className="w-4" />}
        </div>
        <Folder size={14} className="mr-2 flex-shrink-0" style={{ color: isSelected ? '#60a5fa' : 'var(--text-3)' }} />
        <span className="truncate flex-1">{node.name}</span>
        <div className="flex items-center gap-1.5 ml-2 text-[10px] text-[var(--text-2)] opacity-70">
          {node.children.length > 0 && <span className="flex items-center gap-0.5"><Folder size={10}/> {node.children.length}</span>}
          {node.articleCount > 0 && <span className="flex items-center gap-0.5"><FileText size={10}/> {node.articleCount}</span>}
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child: any) => (
            <TreeItem key={child.id} node={child} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExplorerTree({ tree, currentFolderId, setCurrentFolderId }: any) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = currentFolderId === null;
  const hasChildren = tree && tree.length > 0;

  return (
    <div>
      <div 
        className="flex items-center py-1.5 px-2 cursor-pointer hover:bg-[var(--bg-surface)] text-[13px] text-[var(--text-1)]"
        style={{ paddingLeft: 8, background: isSelected ? 'rgba(37,99,235,0.1)' : '', color: isSelected ? '#60a5fa' : '' }}
        onClick={() => { setCurrentFolderId(null); setExpanded(true); }}
      >
        <div className="w-4 h-4 flex items-center justify-center mr-1" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <div className="w-4" />}
        </div>
        <Folder size={14} className="mr-2 flex-shrink-0" style={{ color: isSelected ? '#60a5fa' : 'var(--text-3)' }} />
        <span className="font-medium truncate flex-1">Root Space</span>
        <div className="flex items-center gap-1.5 ml-2 text-[10px] text-[var(--text-2)] opacity-70">
          <span className="flex items-center gap-0.5"><Folder size={10}/> {tree.length}</span>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {tree.map((child: any) => (
            <TreeItem key={child.id} node={child} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId} level={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KBDocumentationPage() {
  const router = useRouter();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const { data: folders = [] } = useKBFolders();
  const { data: allArticles = [] } = useKBArticles('documentation');
  
  const createFolder = useCreateKBFolder();
  const updateFolder = useUpdateKBFolder();
  const deleteFolder = useDeleteKBFolder();
  const createArticle = useCreateKBArticle();
  const updateArticle = useUpdateKBArticle();
  const deleteArticle = useDeleteKBArticle();

  const articles = useMemo(() => allArticles.filter(a => a.folder_id === currentFolderId), [allArticles, currentFolderId]);
  const tree = useMemo(() => buildTree(folders, allArticles), [folders, allArticles]);
  const currentSubFolders = useMemo(() => folders.filter(f => f.parent_id === currentFolderId), [folders, currentFolderId]);

  const breadcrumbs = useMemo(() => {
    let crumbs = [];
    let curr = folders.find(f => f.id === currentFolderId);
    while (curr) {
      crumbs.unshift(curr);
      curr = folders.find(f => f.id === curr!.parent_id);
    }
    return crumbs;
  }, [folders, currentFolderId]);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'rename' | 'copy' | 'move' | 'delete' | 'create_doc' | null;
    targetType: 'folder' | 'article' | null;
    targetItem: any;
    inputValue: string;
  }>({ isOpen: false, type: null, targetType: null, targetItem: null, inputValue: '' });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modalState.isOpen && inputRef.current && modalState.type !== 'delete') {
      inputRef.current.focus();
    }
  }, [modalState.isOpen, modalState.type]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder.mutateAsync({ name: newFolderName, parent_id: currentFolderId });
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleCreateDocument = async () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const uniqueId = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const title = `D${dd}${mm}${yyyy}.${uniqueId}`;
    
    const newDoc = await createArticle.mutateAsync({
      title: title, category: 'documentation', status: 'draft', folder_id: currentFolderId
    });
    if (newDoc && newDoc.id) router.push(`/kb/documentation/${newDoc.id}?edit=true`);
  };

  const handleRenameFolder = (folder: any) => {
    setModalState({ isOpen: true, type: 'rename', targetType: 'folder', targetItem: folder, inputValue: folder.name });
  };

  const handleRenameArticle = (article: any) => {
    setModalState({ isOpen: true, type: 'rename', targetType: 'article', targetItem: article, inputValue: article.title });
  };

  const handleCopyFolder = (folder: any) => {
    setModalState({ isOpen: true, type: 'copy', targetType: 'folder', targetItem: folder, inputValue: folder.name + " (Copy)" });
  };

  const handleCopyArticle = (article: any) => {
    setModalState({ isOpen: true, type: 'copy', targetType: 'article', targetItem: article, inputValue: article.title + " (Copy)" });
  };

  const handleMoveFolder = (folder: any) => {
    setModalState({ isOpen: true, type: 'move', targetType: 'folder', targetItem: folder, inputValue: currentFolderId || "" });
  };

  const handleMoveArticle = (article: any) => {
    setModalState({ isOpen: true, type: 'move', targetType: 'article', targetItem: article, inputValue: currentFolderId || "" });
  };

  const confirmAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const { type, targetType, targetItem, inputValue } = modalState;
    const val = inputValue.trim();

    if (type === 'rename' && val && val !== (targetItem.name || targetItem.title)) {
      if (targetType === 'folder') updateFolder.mutate({ id: targetItem.id, data: { name: val } });
      else updateArticle.mutate({ id: targetItem.id, data: { title: val } });
    }
    
    if (type === 'copy' && val) {
      if (targetType === 'folder') createFolder.mutate({ name: val, parent_id: targetItem.parent_id });
      else createArticle.mutate({ title: val, category: targetItem.category, status: targetItem.status, folder_id: targetItem.folder_id });
    }
    
    if (type === 'move') {
      const pId = val === '' ? null : val;
      if (targetType === 'folder') {
        if (pId === targetItem.id) { alert("Cannot move into itself"); return; }
        updateFolder.mutate({ id: targetItem.id, data: { parent_id: pId } });
      } else {
        updateArticle.mutate({ id: targetItem.id, data: { folder_id: pId } });
      }
    }
    
    if (type === 'delete') {
      if (targetType === 'folder') deleteFolder.mutate(targetItem.id);
      else deleteArticle.mutate(targetItem.id);
    }

    setModalState({ isOpen: false, type: null, targetType: null, targetItem: null, inputValue: '' });
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'folder') {
        if (data.id === targetFolderId) return;
        updateFolder.mutate({ id: data.id, data: { parent_id: targetFolderId } });
      } else if (data.type === 'article') {
        updateArticle.mutate({ id: data.id, data: { folder_id: targetFolderId } });
      }
    } catch (err) {}
  };

  return (
    <>
      {modalState.isOpen && (
        <>
          <div 
            onClick={() => setModalState({ ...modalState, isOpen: false })}
            style={{ position: 'fixed', inset: 0, zIndex: 8900, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} 
          />
          <div style={{
            position: 'fixed', zIndex: 8901, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 400, background: 'var(--bg-deep)', border: '1px solid var(--border-panel)',
            borderTop: modalState.type === 'delete' ? '2px solid #ef4444' : '2px solid #3b82f6',
            borderRadius: 0, boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {modalState.type === 'delete' ? `Delete ${modalState.targetType}` : 
                 modalState.type === 'create_doc' ? 'New Document' :
                 `${modalState.type} ${modalState.targetType}`}
              </span>
              <button onClick={() => setModalState({ ...modalState, isOpen: false })} className="text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={confirmAction} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {modalState.type === 'delete' ? (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Are you sure you want to delete <strong>{modalState.targetItem?.name || modalState.targetItem?.title}</strong>? This cannot be undone.
                </div>
              ) : (
                <div>
                  <input 
                    ref={inputRef}
                    className="input"
                    placeholder={modalState.type === 'move' ? "Enter Target Folder ID (leave blank for root)..." : "Name..."}
                    value={modalState.inputValue}
                    onChange={e => setModalState({ ...modalState, inputValue: e.target.value })}
                  />
                  {modalState.type === 'move' && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Tip: You can also easily move files by dragging and dropping them into folders.</div>}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setModalState({ ...modalState, isOpen: false })}>Cancel</button>
                <button type="submit" className="btn-primary" style={modalState.type === 'delete' ? { background: '#ef4444', borderColor: '#ef4444' } : {}}>
                  {modalState.type === 'delete' ? 'Delete' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-deep)]">
        <div className="secondary-bar">
        <BookOpen size={13} style={{ color: 'var(--accent-violet-fg)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Knowledge Base</span>
        <span style={{ color: 'var(--border-md)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Documentation</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[240px] flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col">
          <div className="p-3 border-b border-[var(--border-subtle)] flex justify-between items-center">
            <span className="text-[11px] font-bold text-[var(--text-3)] tracking-wider uppercase">Explorer</span>
            <button onClick={() => setIsCreatingFolder(true)} className="p-1 hover:bg-[var(--bg-surface)] rounded text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <div 
            className="flex-1 overflow-y-auto py-2"
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, null)}
          >
            <ExplorerTree tree={tree} currentFolderId={currentFolderId} setCurrentFolderId={setCurrentFolderId} />
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[var(--bg-deep)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center text-[13px] font-medium text-[var(--text-2)]">
              <span 
                className="cursor-pointer hover:text-[var(--text-1)] transition-colors" 
                onClick={() => setCurrentFolderId(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(e, null)}
              >
                Root Space
              </span>
              {breadcrumbs.map(crumb => (
                <React.Fragment key={crumb.id}>
                  <ChevronRight size={14} className="mx-1 opacity-50 flex-shrink-0" />
                  <span 
                    className="cursor-pointer hover:text-[var(--text-1)] transition-colors truncate max-w-[150px]" 
                    onClick={() => setCurrentFolderId(crumb.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, crumb.id)}
                  >
                    {crumb.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsCreatingFolder(true)} className="btn-secondary py-1.5">
                <Folder size={14} /> New Folder
              </button>
              <button onClick={handleCreateDocument} className="btn-primary py-1.5">
                <FileText size={14} /> New Document
              </button>
            </div>
          </div>

          <div 
            className="flex-1 overflow-y-auto p-6"
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDrop(e, currentFolderId)}
          >
            {isCreatingFolder && (
              <form onSubmit={handleCreateFolder} className="mb-6 flex gap-2">
                <input 
                  autoFocus
                  className="input max-w-[250px]"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                />
                <button type="submit" className="btn-primary">Create</button>
                <button type="button" onClick={() => setIsCreatingFolder(false)} className="btn-secondary">Cancel</button>
              </form>
            )}

            {(currentSubFolders.length === 0 && articles.length === 0 && !isCreatingFolder) && (
              <div className="empty-state">
                <Folder size={40} className="text-[var(--text-4)] mb-4" />
                <p className="text-[14px] font-semibold text-[var(--text-1)]">This folder is empty</p>
                <p className="text-[13px] text-[var(--text-2)]">Create a new folder or document to get started.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {currentSubFolders.map(folder => (
                <div 
                  key={folder.id} 
                  className="panel flex flex-col p-4 cursor-pointer group hover:border-[#60a5fa] transition-colors"
                  onClick={() => setCurrentFolderId(folder.id)}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', id: folder.id }))}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.stopPropagation(); handleDrop(e, folder.id); }}
                >
                  <div className="flex items-start justify-between">
                    <Folder size={28} className="text-[#60a5fa] mb-3" />
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1.5 text-[var(--text-3)] transition-opacity">
                      <button title="Rename" onClick={(e) => { e.stopPropagation(); handleRenameFolder(folder); }} className="hover:text-[#60a5fa]"><Edit2 size={14} /></button>
                      <button title="Copy" onClick={(e) => { e.stopPropagation(); handleCopyFolder(folder); }} className="hover:text-[var(--text-1)]"><Copy size={14} /></button>
                      <button title="Move" onClick={(e) => { e.stopPropagation(); handleMoveFolder(folder); }} className="hover:text-[#a78bfa]"><Move size={14} /></button>
                      <button title="Delete" onClick={(e) => { e.stopPropagation(); setModalState({ isOpen: true, type: 'delete', targetType: 'folder', targetItem: folder, inputValue: '' }); }} className="hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <span className="text-[14px] font-medium text-[var(--text-1)] truncate">{folder.name}</span>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--text-3)]">
                    <span className="flex items-center gap-1"><Folder size={12}/> {folders.filter(f => f.parent_id === folder.id).length}</span>
                    <span className="flex items-center gap-1"><FileText size={12}/> {allArticles.filter(a => a.folder_id === folder.id).length}</span>
                  </div>
                </div>
              ))}

              {articles.map(article => (
                <div 
                  key={article.id} 
                  className="panel flex flex-col p-4 cursor-pointer group hover:border-[#10b981] transition-colors"
                  onClick={() => router.push(`/kb/documentation/${article.id}`)}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'article', id: article.id }))}
                >
                  <div className="flex items-start justify-between">
                    <FileText size={28} className="text-[#10b981] mb-3" />
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1.5 text-[var(--text-3)] transition-opacity">
                      <button title="Rename" onClick={(e) => { e.stopPropagation(); handleRenameArticle(article); }} className="hover:text-[#10b981]"><Edit2 size={14} /></button>
                      <button title="Copy" onClick={(e) => { e.stopPropagation(); handleCopyArticle(article); }} className="hover:text-[var(--text-1)]"><Copy size={14} /></button>
                      <button title="Move" onClick={(e) => { e.stopPropagation(); handleMoveArticle(article); }} className="hover:text-[#a78bfa]"><Move size={14} /></button>
                      <button title="Delete" onClick={(e) => { e.stopPropagation(); setModalState({ isOpen: true, type: 'delete', targetType: 'article', targetItem: article, inputValue: '' }); }} className="hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <span className="text-[14px] font-medium text-[var(--text-1)] truncate">{article.title}</span>
                  <span className="text-[11px] text-[var(--text-3)] mt-1 uppercase font-bold tracking-wider">{article.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
