import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth, ROLE_LABEL, type AppRole } from "@/modules/refit/lib/auth";
import { db } from "@/modules/refit/lib/db";
import {
  Section,
  ListShell,
  ListHeader,
  EmptyState,
  ErrorBlock,
  Field,
  inputCls,
  PrimaryBtn,
  GhostBtn,
} from "@/modules/refit/components/ui-kit";
import { can } from "@/modules/refit/lib/permissions";

type Profile = { id: string; email: string; display_name: string | null };
type UserRole = { id: string; user_id: string; role: AppRole; vessel_id: string | null };
type Department = { id: string; code: string; name: string };
type CostCode = { id: string; code: string; name: string };

export default function AdminPage() {
  const { roles } = useAuth();
  const allowed = can(roles, "admin.manage_users") || can(roles, "admin.manage_settings");

  if (!allowed) {
    return (
      <AppShell>
        <div className="p-8 text-sm">
          <PageHeader title="Admin" subtitle="You do not have access to this section." />
          <Link to="/yard/refit" className="text-ocean">
            ← Back to dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1400px] mx-auto">
        <PageHeader
          title="Admin & Settings"
          subtitle="Users, roles, lookup tables and project metadata"
        />
        <div className="grid grid-cols-1 gap-6">
          <UsersAndRolesSection />
          <DepartmentsSection />
          <CostCodesSection />
        </div>
      </div>
    </AppShell>
  );
}

function UsersAndRolesSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState("");
  const [grantRole, setGrantRole] = useState<AppRole>("crew_member");

  const load = async () => {
    const [p, r] = await Promise.all([
      db.from("rf_profiles" as any).select("id, email, display_name"),
      db.from("user_roles").select("*"),
    ]);
    if (p.error) setError(p.error.message);
    if (r.error) setError(r.error.message);
    setProfiles((p.data as unknown as Profile[]) ?? []);
    setUserRoles((r.data as unknown as UserRole[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const grant = async () => {
    if (!grantUser) return;
    const { error } = await db.from("user_roles").insert({ user_id: grantUser, role: grantRole });
    if (error) setError(error.message);
    setGrantUser("");
    load();
  };
  const revoke = async (id: string) => {
    const { error } = await db.from("user_roles").delete().eq("id", id);
    if (error) setError(error.message);
    load();
  };

  const allRoles = Object.keys(ROLE_LABEL) as unknown as AppRole[];

  return (
    <Section title="Users & roles">
      {error && <ErrorBlock message={error} />}

      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <Field label="User">
          <select
            value={grantUser}
            onChange={(e) => setGrantUser(e.target.value)}
            className={inputCls}
          >
            <option value="">— Select user —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role to grant">
          <select
            value={grantRole}
            onChange={(e) => setGrantRole(e.target.value as AppRole)}
            className={inputCls}
          >
            {allRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <PrimaryBtn onClick={grant} disabled={!grantUser}>
          Grant role
        </PrimaryBtn>
      </div>

      <ListShell>
        <ListHeader>
          <div style={{ gridTemplateColumns: "1fr 200px 100px", display: "grid", width: "100%" }}>
            <div>User</div>
            <div>Role</div>
            <div></div>
          </div>
        </ListHeader>
        {userRoles.length === 0 ? (
          <EmptyState title="No roles assigned" />
        ) : (
          userRoles.map((ur) => {
            const p = profiles.find((x) => x.id === ur.user_id);
            return (
              <div
                key={ur.id}
                className="px-4 py-2.5 grid items-center border-b border-black/5"
                style={{ gridTemplateColumns: "1fr 200px 100px" }}
              >
                <span className="text-sm">{p?.email ?? ur.user_id}</span>
                <span className="text-xs uppercase tracking-wider text-ocean">
                  {ROLE_LABEL[ur.role]}
                </span>
                <button
                  onClick={() => revoke(ur.id)}
                  className="text-xs text-danger hover:underline"
                >
                  Revoke
                </button>
              </div>
            );
          })
        )}
      </ListShell>
    </Section>
  );
}

function DepartmentsSection() {
  const [items, setItems] = useState<Department[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await db
      .from("rf_departments" as any)
      .select("*")
      .is("archived_at", null)
      .order("code");
    if (error) setError(error.message);
    setItems((data as unknown as Department[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!code || !name) return;
    const { error } = await db.from("rf_departments" as any).insert({ code, name });
    if (error) setError(error.message);
    setCode("");
    setName("");
    load();
  };

  return (
    <Section title="Departments">
      {error && <ErrorBlock message={error} />}
      <div className="mb-4 flex gap-2 items-end">
        <Field label="Code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputCls} w-32`}
          />
        </Field>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} w-72`}
          />
        </Field>
        <GhostBtn onClick={add}>Add</GhostBtn>
      </div>
      <ListShell>
        {items.length === 0 ? (
          <EmptyState title="No departments" />
        ) : (
          items.map((d) => (
            <div
              key={d.id}
              className="px-4 py-2 grid items-center border-b border-black/5"
              style={{ gridTemplateColumns: "120px 1fr" }}
            >
              <span className="font-mono text-xs">{d.code}</span>
              <span className="text-sm">{d.name}</span>
            </div>
          ))
        )}
      </ListShell>
    </Section>
  );
}

function CostCodesSection() {
  const [items, setItems] = useState<CostCode[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await db
      .from("rf_cost_codes" as any)
      .select("*")
      .is("archived_at", null)
      .order("code");
    if (error) setError(error.message);
    setItems((data as unknown as CostCode[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!code || !name) return;
    const { error } = await db.from("rf_cost_codes" as any).insert({ code, name });
    if (error) setError(error.message);
    setCode("");
    setName("");
    load();
  };

  return (
    <Section title="Cost codes">
      {error && <ErrorBlock message={error} />}
      <div className="mb-4 flex gap-2 items-end">
        <Field label="Code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputCls} w-32`}
          />
        </Field>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} w-72`}
          />
        </Field>
        <GhostBtn onClick={add}>Add</GhostBtn>
      </div>
      <ListShell>
        {items.length === 0 ? (
          <EmptyState title="No cost codes" />
        ) : (
          items.map((c) => (
            <div
              key={c.id}
              className="px-4 py-2 grid items-center border-b border-black/5"
              style={{ gridTemplateColumns: "120px 1fr" }}
            >
              <span className="font-mono text-xs">{c.code}</span>
              <span className="text-sm">{c.name}</span>
            </div>
          ))
        )}
      </ListShell>
    </Section>
  );
}
