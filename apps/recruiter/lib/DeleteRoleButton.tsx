'use client';

import { useState } from 'react';
import { Button } from '@cap/ui';
import { Trash2 } from 'lucide-react';

export function DeleteRoleButton({ roleId, roleName }: { roleId: string; roleName: string }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete role "${roleName}"? Sessions using this role will keep their current stage order but lose the role link.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/roles/${roleId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const j = await res.json().catch(() => ({})) as { error?: string };
      alert(j.error ?? 'Failed to delete role');
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => { void handleDelete(); }}
      disabled={deleting}
      style={{ color: 'var(--cap-danger)', borderColor: 'var(--cap-danger-border)' }}
    >
      <Trash2 size={12} strokeWidth={2} aria-hidden />
      {deleting ? '…' : 'Delete'}
    </Button>
  );
}
