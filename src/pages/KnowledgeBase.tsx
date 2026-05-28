import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCategories,
  useDocuments,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCreateDocument,
  useUpdateDocument,
  useDeleteDocument,
} from "@/hooks/useKnowledgeBase";
import { supabase } from "@/integrations/supabase/client";
import { extractStorageReference, signFileUrl } from "@/lib/storage-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen, FileText, Code, Shield, Image, Rocket, Monitor, HelpCircle, Briefcase, FolderOpen,
  Plus, Search, Pencil, Trash2, ExternalLink, Download, Upload, Link, File, Globe, Lock, Users,
  MoreVertical, Files, LayoutList, LayoutGrid, ChevronRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen, FileText, Code, Shield, Image, Rocket, Monitor, HelpCircle, Briefcase, FolderOpen,
};

function getIcon(name?: string | null) {
  if (!name) return FolderOpen;
  return ICON_MAP[name] || FolderOpen;
}

const VISIBILITY_OPTIONS = [
  { value: "global", label: "All Partners + HQ", icon: Globe },
  { value: "hq_only", label: "HQ Only", icon: Lock },
  { value: "partner_specific", label: "Specific Partner", icon: Users },
];

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "pdf", label: "PDF" },
  { value: "link", label: "Link" },
  { value: "doc", label: "Document" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

function buildCategoryOptions(categories: any[]) {
  const topCats = categories.filter((c) => !c.parent_category_id);
  const result: { id: string; label: string; depth: number }[] = [];
  for (const cat of topCats) {
    result.push({ id: cat.id, label: cat.name, depth: 0 });
    const subs = categories.filter((c) => c.parent_category_id === cat.id);
    for (const sub of subs) {
      result.push({ id: sub.id, label: `↳ ${sub.name}`, depth: 1 });
    }
  }
  return result;
}

function getFileTypeLabel(fileType: string | null) {
  if (!fileType) return "File";
  if (fileType === "link") return "Link";
  return fileType.toUpperCase();
}

function getFileTypeVariant(fileType: string | null): "default" | "secondary" | "outline" | "info" {
  if (fileType === "link") return "info";
  if (fileType === "pdf") return "destructive" as any;
  return "outline";
}

export default function KnowledgeBase() {
  const { isAdmin, user, profile, roles } = useAuth();
  const { data: categories = [], isLoading: catLoading } = useCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { data: documents = [], isLoading: docLoading } = useDocuments(selectedCategoryId);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  const topCategories = categories.filter((c: any) => !c.parent_category_id);
  const getSubcategories = (parentId: string) => categories.filter((c: any) => c.parent_category_id === parentId);

  const filteredDocs = documents.filter((d: any) => {
    if (search) {
      const s = search.toLowerCase();
      const match = d.title?.toLowerCase().includes(s) ||
        d.description?.toLowerCase().includes(s) ||
        d.tags?.some((t: string) => t.toLowerCase().includes(s));
      if (!match) return false;
    }
    if (typeFilter !== "all") {
      if (typeFilter === "other") {
        return !["pdf", "link", "doc", "docx", "video", "mp4"].includes(d.file_type?.toLowerCase());
      }
      if (typeFilter === "video") {
        return ["video", "mp4", "webm", "avi"].includes(d.file_type?.toLowerCase());
      }
      if (typeFilter === "doc") {
        return ["doc", "docx", "txt", "rtf"].includes(d.file_type?.toLowerCase());
      }
      return d.file_type?.toLowerCase() === typeFilter;
    }
    return true;
  });

  const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId);

  const logKbAccessAttempt = useCallback((action: "preview" | "download", doc: any) => {
    const ref = extractStorageReference("documents", doc?.file_url || "");
    console.info("[KB-DIAG] attempt", {
      action,
      currentAuthUserId: user?.id ?? null,
      profileRoles: roles,
      profileIsHq: profile?.is_hq ?? null,
      profilePartnerId: profile?.partner_id ?? null,
      documentId: doc?.id ?? null,
      documentTitle: doc?.title ?? null,
      documentVisibilityScope: doc?.visibility_scope ?? null,
      documentPartnerId: doc?.partner_id ?? null,
      storedFileUrl: doc?.file_url ?? null,
      storedFilePath: doc?.file_path ?? null,
      storedFileName: doc?.file_name ?? null,
      extractedBucket: ref.extractedBucket,
      extractedObjectPath: ref.extractedObjectPath,
      referenceParseError: ref.parseError,
    });
  }, [profile?.is_hq, profile?.partner_id, roles, user?.id]);

  // Find which accordion value should be open based on selected category
  const getAccordionDefault = () => {
    if (!selectedCategoryId) return undefined;
    const cat = categories.find((c: any) => c.id === selectedCategoryId);
    if (!cat) return undefined;
    if (cat.parent_category_id) return cat.parent_category_id;
    return cat.id;
  };

  return (
    <div className="space-y-6 animate-reveal-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">Documentation, guides, and resources for the partner ecosystem</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditingCat(null); setShowCatDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Category
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulkDialog(true)}>
              <Files className="h-4 w-4 mr-1" /> Bulk Upload
            </Button>
            <Button size="sm" onClick={() => { setEditingDoc(null); setShowDocDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Resource
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Left: Collapsible category sidebar */}
        <div className="w-60 shrink-0">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mb-1 ${
              !selectedCategoryId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <BookOpen className="h-4 w-4" /> All Resources
          </button>

          {catLoading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <Accordion type="single" collapsible defaultValue={getAccordionDefault()} className="space-y-0.5">
              {topCategories.map((cat: any) => {
                const Icon = getIcon(cat.icon);
                const subs = getSubcategories(cat.id);

                if (subs.length === 0) {
                  // No subcategories — render as a simple button
                  return (
                    <div key={cat.id} className="flex items-center group">
                      <button
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedCategoryId === cat.id ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{cat.name}</span>
                      </button>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingCat(cat); setShowCatDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteCategory(cat)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                }

                return (
                  <AccordionItem key={cat.id} value={cat.id} className="border-none">
                    <div className="flex items-center group">
                      <AccordionTrigger className="flex-1 py-2 px-3 rounded-md text-sm hover:bg-muted hover:no-underline [&[data-state=open]]:bg-muted/50 gap-2">
                        <span
                          className={`flex items-center gap-2 flex-1 text-left ${
                            selectedCategoryId === cat.id ? "text-primary font-medium" : "text-foreground"
                          }`}
                          onClick={(e) => { e.stopPropagation(); setSelectedCategoryId(cat.id); }}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{cat.name}</span>
                        </span>
                      </AccordionTrigger>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingCat(cat); setShowCatDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteCategory(cat)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <AccordionContent className="pb-1 pt-0">
                      <div className="ml-3 border-l border-border pl-2 space-y-0.5">
                        {subs.map((sub: any) => {
                          const SubIcon = getIcon(sub.icon);
                          return (
                            <div key={sub.id} className="flex items-center group">
                              <button
                                onClick={() => setSelectedCategoryId(sub.id)}
                                className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                                  selectedCategoryId === sub.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                <SubIcon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{sub.name}</span>
                              </button>
                              {isAdmin && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity">
                                      <MoreVertical className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setEditingCat(sub); setShowCatDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteCategory(sub)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        {/* Right: Resource area */}
        <div className="flex-1 space-y-4">
          {/* Search + Filters + View Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search resources…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-r-none"
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-l-none"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {selectedCategory && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>All Resources</span>
              <ChevronRight className="h-3.5 w-3.5" />
              {selectedCategory.parent_category_id && (() => {
                const parent = categories.find((c: any) => c.id === selectedCategory.parent_category_id);
                return parent ? (
                  <>
                    <button onClick={() => setSelectedCategoryId(parent.id)} className="hover:text-foreground transition-colors">{parent.name}</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                ) : null;
              })()}
              <span className="text-foreground font-medium">{selectedCategory.name}</span>
            </div>
          )}

          {docLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading resources…</div>
          ) : filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No resources found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAdmin ? "Click '+ Resource' to add the first document." : "Resources will appear here once published by HQ."}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === "list" ? (
            /* ── TABLE VIEW ── */
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[40%]">Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc: any) => {
                    const isLink = doc.file_type === "link";
                    const catName = doc.document_categories?.name;
                    return (
                      <TableRow key={doc.id} className="group cursor-pointer" onClick={() => handleOpenDoc(doc)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                              {isLink ? <Link className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {catName ? <Badge variant="secondary" className="text-[11px]">{catName}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] uppercase">
                            {isLink ? "🔗 Link" : getFileTypeLabel(doc.file_type)}
                          </Badge>
                          {doc.visibility_scope === "hq_only" && (
                            <Badge variant="destructive" className="text-[11px] ml-1"><Lock className="h-3 w-3 mr-0.5" />HQ</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {doc.updated_at ? format(new Date(doc.updated_at), "dd MMM yyyy") : doc.created_at ? format(new Date(doc.created_at), "dd MMM yyyy") : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {doc.file_url ? (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => isLink ? handleOpenDoc(doc) : handleDownloadDoc(doc)}
                                title={isLink ? "Open link" : "Download file"}
                              >
                                {isLink ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-40 cursor-not-allowed" title="File reference missing" disabled>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => { setEditingDoc(doc); setShowDocDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleArchiveDoc(doc.id)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Archive</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* ── GRID VIEW ── */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((doc: any) => {
                const isLink = doc.file_type === "link";
                const catName = doc.document_categories?.name;
                return (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow group cursor-pointer" onClick={() => handleOpenDoc(doc)}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {isLink ? <Link className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          {doc.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        {catName && <Badge variant="secondary" className="text-[11px]">{catName}</Badge>}
                        <Badge variant="outline" className="text-[11px] uppercase">{isLink ? "🔗 Link" : getFileTypeLabel(doc.file_type)}</Badge>
                        {doc.visibility_scope === "hq_only" && <Badge variant="destructive" className="text-[11px]"><Lock className="h-3 w-3 mr-0.5" />HQ</Badge>}
                      </div>
                      <div className="flex items-center justify-between mt-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] text-muted-foreground">
                          {doc.updated_at ? format(new Date(doc.updated_at), "dd MMM yyyy") : ""}
                        </span>
                        <div className="flex gap-1">
                          {doc.file_url ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => isLink ? handleOpenDoc(doc) : handleDownloadDoc(doc)}>
                              {isLink ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-40" disabled title="File missing">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditingDoc(doc); setShowDocDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleArchiveDoc(doc.id)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Archive</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Results count */}
          {!docLoading && filteredDocs.length > 0 && (
            <p className="text-xs text-muted-foreground">{filteredDocs.length} resource{filteredDocs.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      <CategoryDialog
        open={showCatDialog}
        onOpenChange={setShowCatDialog}
        editing={editingCat}
        categories={categories}
        onCreate={(v: any) => createCategory.mutate(v, {
          onSuccess: () => { setShowCatDialog(false); toast({ title: "Category created" }); },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        })}
        onUpdate={(v: any) => updateCategory.mutate(v, {
          onSuccess: () => { setShowCatDialog(false); toast({ title: "Category updated" }); },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        })}
        saving={createCategory.isPending || updateCategory.isPending}
      />

      <DocumentDialog
        open={showDocDialog}
        onOpenChange={setShowDocDialog}
        editing={editingDoc}
        categories={categories}
        onCreate={(v: any) => createDocument.mutate(v, {
          onSuccess: () => { setShowDocDialog(false); toast({ title: "Resource created" }); },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        })}
        onUpdate={(v: any) => updateDocument.mutate(v, {
          onSuccess: () => { setShowDocDialog(false); toast({ title: "Resource updated" }); },
          onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
        })}
        saving={createDocument.isPending || updateDocument.isPending}
      />

      <BulkUploadDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        categories={categories}
        onComplete={() => { setShowBulkDialog(false); }}
      />

      {/* PDF Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="truncate pr-8">{previewDoc?.title || "Document Preview"}</DialogTitle>
            <DialogDescription className="sr-only">Preview of the selected document</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 relative">
            {previewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-sm text-muted-foreground">Loading preview…</div>
              </div>
            ) : previewBlobUrl ? (
              <iframe
                src={previewBlobUrl}
                className="w-full h-full border-0"
                title={previewDoc?.title || "Document Preview"}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <p className="text-sm text-muted-foreground">Preview could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => previewDoc && handleDownloadDoc(previewDoc)}>
                  <Download className="h-4 w-4 mr-2" /> Download instead
                </Button>
              </div>
            )}
          </div>
          <div className="px-6 py-3 border-t shrink-0 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => previewDoc && handleDownloadDoc(previewDoc)}>
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button variant="ghost" size="sm" onClick={closePreview}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function handleOpenDoc(doc: any) {
    logKbAccessAttempt("preview", doc);
    if (!doc.file_url) {
      console.error("[KB-DIAG] missing-file-reference", {
        action: "preview",
        currentAuthUserId: user?.id ?? null,
        documentId: doc?.id ?? null,
        documentTitle: doc?.title ?? null,
      });
      toast({ title: "File unavailable", description: "This document has no file or link reference.", variant: "destructive" });
      return;
    }
    const isLink = doc.file_type === "link";
    if (isLink) {
      window.open(doc.file_url, "_blank", "noopener,noreferrer");
      return;
    }
    const isPdf = doc.file_type?.toLowerCase() === "pdf" || doc.file_url?.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setPreviewDoc(doc);
      setPreviewLoading(true);
      setPreviewBlobUrl(null);
      try {
        const signed = await signFileUrl("documents", doc.file_url, 60 * 60, {
          context: "knowledge-base",
          action: "preview",
          documentId: doc.id,
        });
        if (!signed) throw new Error("Could not sign URL");
        const res = await fetch(signed);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        setPreviewBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const likelyCause = message.includes("HTTP 404")
          ? "likely_object_not_found_after_signing"
          : message.includes("HTTP 401") || message.includes("HTTP 403")
            ? "likely_signed_url_access_denied"
            : message === "Could not sign URL"
              ? "signing_failed_check_signFileUrl_error"
              : "unknown";
        console.error("[KB-DIAG] fetch:error", {
          action: "preview",
          currentAuthUserId: user?.id ?? null,
          documentId: doc?.id ?? null,
          documentTitle: doc?.title ?? null,
          fetchErrorMessage: message,
          likelyCause,
        });
        console.error("[KnowledgeBase] PDF fetch failed:", err);
        toast({ title: "Preview unavailable", description: "Could not load preview. Try downloading instead.", variant: "destructive" });
        setPreviewDoc(null);
      } finally {
        setPreviewLoading(false);
      }
      return;
    }
    // Non-PDF files: blob download
    await handleDownloadDoc(doc);
  }

  async function handleDownloadDoc(doc: any) {
    logKbAccessAttempt("download", doc);
    if (!doc.file_url) {
      console.error("[KB-DIAG] missing-file-reference", {
        action: "download",
        currentAuthUserId: user?.id ?? null,
        documentId: doc?.id ?? null,
        documentTitle: doc?.title ?? null,
      });
      toast({ title: "File unavailable", description: "This document has no file reference.", variant: "destructive" });
      return;
    }
    try {
      const signed = await signFileUrl("documents", doc.file_url, 60 * 60, {
        context: "knowledge-base",
        action: "download",
        documentId: doc.id,
      });
      if (!signed) throw new Error("Could not sign URL");
      const res = await fetch(signed);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = doc.file_name || doc.title || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const likelyCause = message.includes("HTTP 404")
        ? "likely_object_not_found_after_signing"
        : message.includes("HTTP 401") || message.includes("HTTP 403")
          ? "likely_signed_url_access_denied"
          : message === "Could not sign URL"
            ? "signing_failed_check_signFileUrl_error"
            : "unknown";
      console.error("[KB-DIAG] fetch:error", {
        action: "download",
        currentAuthUserId: user?.id ?? null,
        documentId: doc?.id ?? null,
        documentTitle: doc?.title ?? null,
        fetchErrorMessage: message,
        likelyCause,
      });
      console.error("[KnowledgeBase] Download failed:", err);
      toast({ title: "Download failed", description: "This document could not be downloaded. Please try again.", variant: "destructive" });
    }
  }

  function closePreview() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewDoc(null);
    setPreviewBlobUrl(null);
  }

  function handleArchiveDoc(id: string) {
    deleteDocument.mutate(id, {
      onSuccess: () => toast({ title: "Resource archived" }),
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  }

  async function handleDeleteCategory(cat: any) {
    // Check if category has documents before allowing deletion
    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("category_id", cat.id)
      .eq("is_active", true);

    if (countError) {
      toast({ title: "Error checking category", description: countError.message, variant: "destructive" });
      return;
    }

    if (count && count > 0) {
      toast({
        title: "Cannot delete category",
        description: `This category contains ${count} document${count !== 1 ? "s" : ""}. Move or remove them first.`,
        variant: "destructive",
      });
      return;
    }

    // Also check subcategories
    const subs = categories.filter((c: any) => c.parent_category_id === cat.id);
    if (subs.length > 0) {
      toast({
        title: "Cannot delete category",
        description: "This category has subcategories. Delete them first.",
        variant: "destructive",
      });
      return;
    }

    if (confirm(`Delete "${cat.name}"?`)) {
      deleteCategory.mutate(cat.id, {
        onSuccess: () => {
          toast({ title: "Category deleted" });
          if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
        },
        onError: (e: any) => {
          const msg = e.message?.includes("foreign key")
            ? "This category cannot be deleted because it contains documents."
            : e.message;
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      });
    }
  }
}

/* ── Category Dialog ── */
function CategoryDialog({ open, onOpenChange, editing, categories, onCreate, onUpdate, saving }: any) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("FolderOpen");
  const [parentId, setParentId] = useState<string | null>(null);
  const isEdit = !!editing;

  const handleOpen = (o: boolean) => {
    if (o && editing) {
      setName(editing.name || ""); setDescription(editing.description || ""); setIcon(editing.icon || "FolderOpen"); setParentId(editing.parent_category_id || null);
    } else if (o) {
      setName(""); setDescription(""); setIcon("FolderOpen"); setParentId(null);
    }
    onOpenChange(o);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (isEdit) {
      onUpdate({ id: editing.id, name, description, icon, parent_category_id: parentId });
    } else {
      onCreate({ name, description, icon, parent_category_id: parentId, sort_order: categories.length + 1 });
    }
  };

  const parentOptions = categories.filter((c: any) => !c.parent_category_id && c.id !== editing?.id);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "New Category"}</DialogTitle>
          <DialogDescription>Organize your knowledge base with categories and subcategories.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Materials" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" rows={2} /></div>
          <div>
            <Label>Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(ICON_MAP).map((i) => {
                  const I = ICON_MAP[i];
                  return <SelectItem key={i} value={i}><span className="flex items-center gap-2"><I className="h-4 w-4" />{i}</span></SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Parent Category</Label>
            <Select value={parentId || "_none"} onValueChange={(v) => setParentId(v === "_none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="None (top level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None (top level)</SelectItem>
                {parentOptions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Document Dialog ── */
function DocumentDialog({ open, onOpenChange, editing, categories, onCreate, onUpdate, saving }: any) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("link");
  const [visibility, setVisibility] = useState("global");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const isEdit = !!editing;

  const categoryOptions = buildCategoryOptions(categories);

  // Pre-fill (or reset) state whenever the dialog opens. Using an effect — not
  // onOpenChange — ensures values are populated when the parent opens the
  // dialog programmatically (Radix only fires onOpenChange on user-driven
  // state changes, so the previous handler never ran on edit).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || "");
      setDescription(editing.description || "");
      setCategoryId(editing.category_id || "");
      setFileUrl(editing.file_url || "");
      setFileType(editing.file_type === "link" ? "link" : (editing.file_type || "file"));
      setVisibility(editing.visibility_scope || "global");
      setTags(Array.isArray(editing.tags) ? editing.tags.join(", ") : "");
      setFileName(editing.file_name || "");
    } else {
      setTitle(""); setDescription(""); setCategoryId("");
      setFileUrl(""); setFileType("link"); setVisibility("global");
      setTags(""); setFileName("");
    }
  }, [open, editing]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "file";
    const path = `kb/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    // Store the storage path; the bucket is private and we sign URLs on read.
    setFileUrl(path);
    setFileType(ext);
    setFileName(file.name);
    setUploading(false);
    toast({ title: "File uploaded successfully" });
  };

  const handleSubmit = () => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (fileType === "link" && fileUrl && !fileUrl.startsWith("http")) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" }); return;
    }
    const parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const payload: any = {
      title, description, category_id: categoryId || null,
      file_url: fileUrl, file_type: fileType, file_name: fileName,
      visibility_scope: visibility, tags: parsedTags,
    };
    if (isEdit) {
      onUpdate({ id: editing.id, ...payload });
    } else {
      onCreate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Resource" : "Add Resource"}</DialogTitle>
          <DialogDescription>Add documentation, links, or files to the knowledge base.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resource title" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" rows={2} /></div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId || "_none"} onValueChange={(v) => setCategoryId(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Uncategorized</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className={c.depth === 1 ? "pl-2 text-muted-foreground" : ""}>{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resource Type</Label>
            <div className="flex gap-2 mt-1">
              <Button type="button" variant={fileType === "link" ? "default" : "outline"} size="sm" onClick={() => { setFileType("link"); setFileUrl(""); setFileName(""); }}>
                <Link className="h-4 w-4 mr-1" /> External Link
              </Button>
              <Button type="button" variant={fileType !== "link" ? "default" : "outline"} size="sm" onClick={() => { setFileType("file"); setFileUrl(""); setFileName(""); }}>
                <Upload className="h-4 w-4 mr-1" /> Upload File
              </Button>
            </div>
          </div>
          {fileType === "link" ? (
            <div><Label>URL</Label><Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" /></div>
          ) : (
            <div>
              <Label>File</Label>
              <Input type="file" onChange={handleFileUpload} disabled={uploading} />
              {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
              {fileUrl && !uploading && <p className="text-xs text-green-600 mt-1 truncate">✓ {fileName || fileUrl.split("/").pop()}</p>}
            </div>
          )}
          <div>
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Tags</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated tags" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || uploading || !title.trim()}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Bulk Upload Dialog ── */
function BulkUploadDialog({ open, onOpenChange, categories, onComplete }: {
  open: boolean; onOpenChange: (o: boolean) => void; categories: any[]; onComplete: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState("global");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createDocument = useCreateDocument();

  const categoryOptions = buildCategoryOptions(categories);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files || []));
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "file";
      const path = `kb/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) { failCount++; setProgress(((i + 1) / files.length) * 100); continue; }
      const title = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      try {
        await new Promise<void>((resolve) => {
          createDocument.mutate({
            title, file_url: path, file_type: ext, file_name: file.name,
            file_size_bytes: file.size, category_id: categoryId || undefined, visibility_scope: visibility,
          }, { onSuccess: () => { successCount++; resolve(); }, onError: () => { failCount++; resolve(); } });
        });
      } catch { failCount++; }
      setProgress(((i + 1) / files.length) * 100);
    }

    setUploading(false); setFiles([]); setProgress(0);
    toast({
      title: "Bulk upload complete",
      description: `${successCount} uploaded${failCount > 0 ? `, ${failCount} failed` : ""}`,
      variant: failCount > 0 ? "destructive" : undefined,
    });
    onComplete();
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) { setFiles([]); setProgress(0); }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Files</DialogTitle>
          <DialogDescription>Upload multiple files at once. Each file will create a separate resource entry.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Select Files</Label>
            <Input ref={fileInputRef} type="file" multiple onChange={handleFilesSelected} disabled={uploading} className="mt-1" />
          </div>
          {files.length > 0 && (
            <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                  {!uploading && <button onClick={() => removeFile(i)} className="text-destructive hover:underline text-xs ml-2">Remove</button>}
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">{files.length} file(s) selected</p>
            </div>
          )}
          <div>
            <Label>Category (applied to all)</Label>
            <Select value={categoryId || "_none"} onValueChange={(v) => setCategoryId(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Uncategorized</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className={c.depth === 1 ? "pl-2 text-muted-foreground" : ""}>{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Visibility (applied to all)</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {uploading && (
            <div className="space-y-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">{Math.round(progress)}% complete</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? "Uploading…" : `Upload ${files.length} File${files.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
