import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  Star,
  Pencil,
  Trash2,
  Plus,
  Search,
  Users,
  Building2,
} from "lucide-react";

type Contact = {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  topics: string[];
  key_topics: string[];
  is_key_contact: boolean;
  notes: string | null;
};

const emptyForm = {
  name: "",
  role: "",
  company: "",
  email: "",
  phone: "",
  topics: "",
  key_topics: "",
  is_key_contact: false,
  notes: "",
};

export default function Contacts() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("nb_contacts")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("is_key_contact", { ascending: false })
      .order("name");
    if (error) toast.error(error.message);
    else setContacts((data as Contact[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      name: c.name,
      role: c.role ?? "",
      company: c.company ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      topics: c.topics.join(", "),
      key_topics: c.key_topics.join(", "),
      is_key_contact: c.is_key_contact,
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const parseList = (s: string) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  const save = async () => {
    if (!currentProject || !user) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      project_id: currentProject.id,
      name: form.name.trim(),
      role: form.role.trim() || null,
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      topics: parseList(form.topics),
      key_topics: parseList(form.key_topics),
      is_key_contact: form.is_key_contact,
      notes: form.notes.trim() || null,
      created_by: user.id,
    };
    const { error } = editing
      ? await supabase.from("nb_contacts").update(payload).eq("id", editing.id)
      : await supabase.from("nb_contacts").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(editing ? "Contact updated" : "Contact added");
      setDialogOpen(false);
      load();
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("nb_contacts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Contact removed");
      load();
    }
  };

  const allTopics = useMemo(() => {
    const s = new Set<string>();
    contacts.forEach((c) => {
      c.topics.forEach((t) => s.add(t));
      c.key_topics.forEach((t) => s.add(t));
    });
    return Array.from(s).sort();
  }, [contacts]);

  const keyByTopic = useMemo(() => {
    const map = new Map<string, Contact[]>();
    contacts.forEach((c) => {
      c.key_topics.forEach((t) => {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(c);
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (topicFilter && !c.topics.includes(topicFilter) && !c.key_topics.includes(topicFilter))
        return false;
      if (!q) return true;
      return [c.name, c.role, c.company, c.email, c.phone, ...(c.topics ?? []), ...(c.key_topics ?? [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [contacts, search, topicFilter]);

  const initials = (name: string) =>
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Contacts
          </h1>
          <p className="text-muted-foreground mt-1">
            Project directory with key contacts highlighted per topic.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Contact" : "New Contact"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Role / Title</Label>
                <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Topics (comma-separated)</Label>
                <Input
                  placeholder="e.g. Piping, Interior, Electrical"
                  value={form.topics}
                  onChange={(e) => setForm({ ...form, topics: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Key Topics (this person is THE go-to for these)</Label>
                <Input
                  placeholder="e.g. Piping"
                  value={form.key_topics}
                  onChange={(e) => setForm({ ...form, key_topics: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Listed topics here will surface this contact at the top of the page under each topic.
                </p>
              </div>
              <div className="col-span-2 flex items-center gap-3 rounded-md border p-3">
                <Switch
                  checked={form.is_key_contact}
                  onCheckedChange={(v) => setForm({ ...form, is_key_contact: v })}
                />
                <div>
                  <Label>Mark as key contact</Label>
                  <p className="text-xs text-muted-foreground">Pinned to top of the directory.</p>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save}>{editing ? "Save changes" : "Add contact"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {keyByTopic.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="h-5 w-5 text-primary" />
              Who to talk to
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {keyByTopic.map(([topic, people]) => (
              <div key={topic} className="border-l-2 border-primary pl-3">
                <div className="text-sm font-semibold mb-2">{topic}</div>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setTopicFilter(topic)}
                      className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-accent transition"
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {initials(p.name)}
                      </span>
                      <span className="font-medium">{p.name}</span>
                      {p.role && <span className="text-muted-foreground text-xs">· {p.role}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts, companies, topics…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {topicFilter && (
          <Badge variant="secondary" className="gap-2">
            Filter: {topicFilter}
            <button onClick={() => setTopicFilter(null)} className="ml-1 text-xs">
              ✕
            </button>
          </Badge>
        )}
        {allTopics.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {allTopics.slice(0, 12).map((t) => (
              <Badge
                key={t}
                variant={topicFilter === t ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setTopicFilter(topicFilter === t ? null : t)}
              >
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No contacts yet. Add the first one to start your directory.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className={c.is_key_contact ? "border-primary/50 shadow-sm" : ""}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                    {initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{c.name}</div>
                      {c.is_key_contact && <Star className="h-4 w-4 text-primary fill-primary" />}
                    </div>
                    {c.role && <div className="text-sm text-muted-foreground truncate">{c.role}</div>}
                    {c.company && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" />
                        {c.company}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(c.id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="space-y-1 text-sm">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{c.email}</span>
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{c.phone}</span>
                    </a>
                  )}
                </div>

                {(c.key_topics.length > 0 || c.topics.length > 0) && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.key_topics.map((t) => (
                      <Badge key={`k-${t}`} className="gap-1">
                        <Star className="h-3 w-3" />
                        {t}
                      </Badge>
                    ))}
                    {c.topics
                      .filter((t) => !c.key_topics.includes(t))
                      .map((t) => (
                        <Badge key={`t-${t}`} variant="outline">
                          {t}
                        </Badge>
                      ))}
                  </div>
                )}

                {c.notes && <p className="text-xs text-muted-foreground border-t pt-2">{c.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
