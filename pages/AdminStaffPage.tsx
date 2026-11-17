import React, { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../services/apiService";
import {
  ADMIN_PERMISSIONS,
  type AdminPermission,
} from "../utils/adminPermissions";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SkeletonRows,
  confirmAction,
  formatRelative,
  notify,
} from "../components/admin/ui";
import {
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUserPlus,
} from "../components/admin/icons";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface StaffMember {
  id: string;
  name: string;
  username: string;
  permissions: AdminPermission[];
  active: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
}

interface StaffForm {
  name: string;
  username: string;
  password: string;
  active: boolean;
  permissions: AdminPermission[];
}

// Funcionário novo começa só com Pedidos e Produtos; o master ajusta.
const EMPTY_FORM: StaffForm = {
  name: "",
  username: "",
  password: "",
  active: true,
  permissions: ["pedidos", "produtos"],
};

const PERMISSION_GROUPS = ADMIN_PERMISSIONS.reduce<
  Array<{ group: string; items: typeof ADMIN_PERMISSIONS }>
>((groups, perm) => {
  const existing = groups.find((g) => g.group === perm.group);
  if (existing) existing.items.push(perm);
  else groups.push({ group: perm.group, items: [perm] });
  return groups;
}, []);

const labelOf = (key: AdminPermission) =>
  ADMIN_PERMISSIONS.find((perm) => perm.key === key)?.label || key;

const readError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || fallback;
  } catch {
    return fallback;
  }
};

const AdminStaffPage: React.FC = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`${API_URL}/api/admin/staff`);
      if (!response.ok) {
        setError(await readError(response, "Não foi possível carregar os funcionários."));
        return;
      }
      const data = await response.json();
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    } catch (err) {
      setError("Não foi possível carregar os funcionários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setForm({
      name: member.name,
      username: member.username,
      password: "",
      active: member.active,
      permissions: [...member.permissions],
    });
    setFormError("");
    setFormOpen(true);
  };

  const togglePermission = (key: AdminPermission) =>
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));

  const save = async () => {
    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    if (!name) return setFormError("Informe o nome do funcionário.");
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return setFormError(
        "Usuário deve ter 3 a 40 caracteres: letras, números, ponto, - ou _ (sem espaços).",
      );
    }
    if (!editing && form.password.length < 4) {
      return setFormError("A senha deve ter pelo menos 4 caracteres.");
    }
    if (editing && form.password && form.password.length < 4) {
      return setFormError("A nova senha deve ter pelo menos 4 caracteres.");
    }

    setSaving(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = {
        name,
        username,
        active: form.active,
        permissions: form.permissions,
      };
      if (form.password) body.password = form.password;
      const response = await authenticatedFetch(
        editing ? `${API_URL}/api/admin/staff/${editing.id}` : `${API_URL}/api/admin/staff`,
        { method: editing ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      if (!response.ok) {
        setFormError(await readError(response, "Não foi possível salvar."));
        return;
      }
      notify(editing ? "Funcionário atualizado" : "Funcionário criado");
      setFormOpen(false);
      load();
    } catch {
      setFormError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (member: StaffMember) => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/admin/staff/${member.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !member.active }),
      });
      if (!response.ok) {
        notify(await readError(response, "Não foi possível alterar."), "error");
        return;
      }
      notify(member.active ? "Login desativado" : "Login reativado");
      load();
    } catch {
      notify("Erro de conexão.", "error");
    }
  };

  const remove = async (member: StaffMember) => {
    const confirmed = await confirmAction({
      title: `Excluir o login de ${member.name}?`,
      text: "O funcionário perde o acesso ao painel imediatamente. Isso não pode ser desfeito.",
      confirmText: "Excluir",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/api/admin/staff/${member.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        notify(await readError(response, "Não foi possível excluir."), "error");
        return;
      }
      notify("Funcionário excluído");
      load();
    } catch {
      notify("Erro de conexão.", "error");
    }
  };

  return (
    <div className="pp-animate-in">
      <PageHeader
        eyebrow="Configurações"
        title="Funcionários"
        description="Crie logins para a equipe e escolha exatamente quais abas do painel cada um pode ver."
        actions={
          <>
            <Button variant="secondary" icon={<IconRefresh />} onClick={load} loading={loading}>
              Atualizar
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={openCreate}>
              Novo funcionário
            </Button>
          </>
        }
      />

      {error && (
        <Card className="mb-5 border-[color:var(--pp-danger)]">
          <p className="text-sm text-[color:var(--pp-danger)]">{error}</p>
        </Card>
      )}

      <Card flush>
        {loading && staff.length === 0 ? (
          <div className="p-4">
            <SkeletonRows rows={3} cols={4} />
          </div>
        ) : staff.length === 0 ? (
          <EmptyState
            icon={<IconUserPlus />}
            title="Nenhum funcionário cadastrado"
            description="Funcionários entram em /admin/login na opção “Funcionário”, com usuário e senha próprios, e só veem as abas que você liberar."
            action={
              <Button variant="primary" icon={<IconPlus />} onClick={openCreate}>
                Criar primeiro login
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[color:var(--pp-border)]">
            {staff.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-4 md:px-5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar name={member.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[color:var(--pp-text)]">
                        {member.name}
                      </span>
                      <span className="text-sm text-[color:var(--pp-text-3)]">
                        @{member.username}
                      </span>
                      {member.active ? (
                        <Badge tone="success" dot>
                          Ativo
                        </Badge>
                      ) : (
                        <Badge tone="danger" dot>
                          Desativado
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {member.permissions.length === 0 ? (
                        <span className="text-xs text-[color:var(--pp-text-3)]">
                          Nenhuma aba liberada
                        </span>
                      ) : (
                        ADMIN_PERMISSIONS.filter((perm) =>
                          member.permissions.includes(perm.key),
                        ).map((perm) => (
                          <Badge key={perm.key} tone="brand">
                            {labelOf(perm.key)}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="mt-1.5 text-xs text-[color:var(--pp-text-3)]">
                      {member.lastLoginAt
                        ? `Último acesso ${formatRelative(member.lastLoginAt)}`
                        : "Ainda não entrou"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(member)}>
                    {member.active ? "Desativar" : "Reativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconEdit />}
                    onClick={() => openEdit(member)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    iconOnly
                    icon={<IconTrash />}
                    aria-label={`Excluir ${member.name}`}
                    title="Excluir"
                    onClick={() => remove(member)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        locked={saving}
        size="lg"
        title={editing ? `Editar ${editing.name}` : "Novo funcionário"}
        description="O funcionário entra em /admin/login, na opção “Funcionário”."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {editing ? "Salvar alterações" : "Criar funcionário"}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="staff-name">
              <input
                id="staff-name"
                className="pp-input"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex.: Maria"
                autoFocus
              />
            </Field>
            <Field label="Usuário (login)" htmlFor="staff-username" help="Sem espaços. Ex.: maria.loja">
              <input
                id="staff-username"
                className="pp-input"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="maria.loja"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Field
              label={editing ? "Nova senha" : "Senha"}
              htmlFor="staff-password"
              help={editing ? "Deixe em branco para manter a senha atual." : "Mínimo de 4 caracteres."}
              className="sm:col-span-2"
            >
              <input
                id="staff-password"
                type="text"
                className="pp-input"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={editing ? "••••••" : "Senha do funcionário"}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="pp-label !mb-0">Abas que pode ver</span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      permissions: ADMIN_PERMISSIONS.map((perm) => perm.key),
                    }))
                  }
                >
                  Marcar todas
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm((prev) => ({ ...prev, permissions: [] }))}
                >
                  Desmarcar todas
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <div
                  key={group.group}
                  className="rounded-xl border border-[color:var(--pp-border)] p-3"
                >
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--pp-text-3)]">
                    {group.group}
                  </div>
                  {group.items.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-[color:var(--pp-surface-2)]"
                    >
                      <input
                        type="checkbox"
                        className="pp-checkbox mt-0.5"
                        checked={form.permissions.includes(perm.key)}
                        onChange={() => togglePermission(perm.key)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[color:var(--pp-text)]">
                          {perm.label}
                        </span>
                        <span className="block text-xs text-[color:var(--pp-text-3)]">
                          {perm.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="pp-checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            <span className="text-sm text-[color:var(--pp-text)]">
              Login ativo (desmarque para bloquear o acesso sem excluir)
            </span>
          </label>

          {formError && <p className="pp-error">{formError}</p>}
          {/* Enter no formulário salva */}
          <button type="submit" hidden aria-hidden="true" />
        </form>
      </Modal>
    </div>
  );
};

export default AdminStaffPage;
